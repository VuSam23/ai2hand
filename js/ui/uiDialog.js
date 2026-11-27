/**
 * js/ui/uiDialog.js — Modal Dialog chuẩn thay thế window.prompt() / window.confirm()
 */
import { escapeHtml } from './uiCommon.js';

let activeResolver = null;
let activeFields = [];
let dialogBound = false;

function closeDialog(result = null) {
  const modal = document.getElementById('app-dialog-modal');
  if (modal) modal.hidden = true;
  document.body.style.overflow = '';
  const resolve = activeResolver;
  activeResolver = null;
  activeFields = [];
  if (resolve) resolve(result);
}

function ensureDialogBound() {
  if (dialogBound) return;
  dialogBound = true;
  document.getElementById('app-dialog-close-btn')?.addEventListener('click', () => closeDialog(null));
  document.getElementById('app-dialog-cancel-btn')?.addEventListener('click', () => closeDialog(null));
  document.getElementById('app-dialog-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'app-dialog-modal') closeDialog(null);
  });
  document.getElementById('app-dialog-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (activeFields.length === 0) return closeDialog(true);
    const values = {};
    activeFields.forEach((f) => {
      values[f.name] = document.getElementById(`dlg-field-${f.name}`)?.value ?? '';
    });
    closeDialog(values);
  });
}

function renderFieldHtml(f) {
  const id = `dlg-field-${escapeHtml(f.name)}`;
  const req = f.required ? 'required' : '';
  if (f.type === 'select') {
    const opts = (f.options || [])
      .map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const lbl = typeof o === 'string' ? o : o.label;
        return `<option value="${escapeHtml(val)}" ${val === f.value ? 'selected' : ''}>${escapeHtml(lbl)}</option>`;
      })
      .join('');
    return `<div class="form-group"><label for="${id}">${escapeHtml(f.label)}</label><select id="${id}" class="form-input" ${req}>${opts}</select></div>`;
  }
  return `<div class="form-group"><label for="${id}">${escapeHtml(f.label)}</label><input id="${id}" type="${escapeHtml(f.type || 'text')}" class="form-input" value="${escapeHtml(f.value ?? '')}" placeholder="${escapeHtml(f.placeholder || '')}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${req} /></div>`;
}

export function openFormDialog({ title, eyebrow = 'Quản trị hệ thống', fields = [], submitLabel = 'Lưu thay đổi' }) {
  ensureDialogBound();
  if (activeResolver) closeDialog(null);
  activeFields = fields;
  document.getElementById('app-dialog-eyebrow').textContent = eyebrow;
  document.getElementById('app-dialog-title').textContent = title;
  document.getElementById('app-dialog-body').innerHTML = fields.map(renderFieldHtml).join('');
  const btn = document.getElementById('app-dialog-confirm-btn');
  btn.textContent = submitLabel;
  btn.className = 'btn btn-primary';
  document.getElementById('app-dialog-modal').hidden = false;
  document.body.style.overflow = 'hidden';
  if (fields[0]) document.getElementById(`dlg-field-${fields[0].name}`)?.focus();
  return new Promise((resolve) => { activeResolver = resolve; });
}

export function openConfirmDialog({ title, message, confirmLabel = 'Xác nhận', isDanger = false }) {
  ensureDialogBound();
  if (activeResolver) closeDialog(null);
  activeFields = [];
  document.getElementById('app-dialog-eyebrow').textContent = 'Xác nhận thao tác';
  document.getElementById('app-dialog-title').textContent = title;
  document.getElementById('app-dialog-body').innerHTML = `<p class="section-subtitle" style="margin:0;">${escapeHtml(message)}</p>`;
  const btn = document.getElementById('app-dialog-confirm-btn');
  btn.textContent = confirmLabel;
  btn.className = isDanger ? 'btn btn-primary' : 'btn btn-secondary';
  document.getElementById('app-dialog-modal').hidden = false;
  document.body.style.overflow = 'hidden';
  return new Promise((resolve) => { activeResolver = resolve; });
}
