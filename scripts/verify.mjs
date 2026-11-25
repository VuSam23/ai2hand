import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const errors = [];
const warnings = [];

function walkFiles(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  const list = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) list.push(...walkFiles(full, exts));
    else if (exts.some((ext) => entry.name.endsWith(ext))) list.push(full);
  }
  return list;
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const htmlIds = new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]));

const jsFiles = walkFiles(path.join(ROOT, 'js'), ['.js', '.mjs']);
const fnFiles = walkFiles(path.join(ROOT, 'supabase', 'functions'), ['.ts', '.js']);

for (const file of [...jsFiles, ...fnFiles]) {
  const rel = path.relative(ROOT, file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/).length;

  if (lines > 300) errors.push(`[LINE_LIMIT] ${rel}: ${lines} lines (> 300)`);
  else if (lines > 260) warnings.push(`[WARN_YELLOW] ${rel}: ${lines} lines (260-299)`);
}

for (const file of jsFiles) {
  const rel = path.relative(ROOT, file);
  const content = fs.readFileSync(file, 'utf8');

  if (content.includes('SERVICE_ROLE_KEY') || content.includes('WEBHOOK_SECRET')) {
    errors.push(`[SECRET_LEAK] ${rel} contains server secret identifier`);
  }
  if (content.includes('setInterval(') && !content.includes('clearInterval(')) {
    errors.push(`[RESOURCE_LEAK] ${rel} uses setInterval without clearInterval`);
  }
  for (const m of content.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!htmlIds.has(m[1])) {
      errors.push(`[MISSING_DOM_ID] ${rel} references #${m[1]} not found in index.html`);
    }
  }
}

warnings.forEach((w) => console.warn(w));
if (errors.length > 0) {
  errors.forEach((e) => console.error(e));
  process.exit(1);
}
console.log(`verify.mjs PASSED (${jsFiles.length} JS files, ${fnFiles.length} Edge Function files checked).`);
