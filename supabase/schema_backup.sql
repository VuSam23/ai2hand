-- =============================================================================
-- WebAccount — Consolidated Supabase Schema, RPC & RLS Backup
-- Đồng bộ toàn bộ cấu trúc bảng, hàm RPC và chính sách bảo mật RLS hiện tại.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLES
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.products (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Tài khoản AI',
  price integer NOT NULL DEFAULT 0,
  description text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  variant_prices jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_url text NOT NULL DEFAULT ''
);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variant_prices jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '';
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS manual_stocks jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS warranty text NOT NULL DEFAULT 'Bảo hành 1 đổi 1 trọn kỳ';

CREATE TABLE IF NOT EXISTS public.inventory_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  duration text DEFAULT '1 Tháng',
  account_type text DEFAULT 'TK cấp sẵn',
  credential text NOT NULL,
  is_sold boolean NOT NULL DEFAULT false,
  order_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_keys_avail
  ON public.inventory_keys (product_id, is_sold, duration, account_type);

CREATE TABLE IF NOT EXISTS public.orders (
  order_code text PRIMARY KEY,
  user_id uuid NULL,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  duration text DEFAULT '1 Tháng',
  account_type text DEFAULT 'TK cấp sẵn',
  contact text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  traffic_source text NOT NULL DEFAULT 'Direct',
  payos_order_code bigint UNIQUE,
  delivered_credential text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS user_id uuid NULL;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS traffic_source text NOT NULL DEFAULT 'Direct';
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payos_order_code bigint UNIQUE;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'pending_manual', 'cancelled', 'failed'));

CREATE INDEX IF NOT EXISTS idx_orders_user_id
  ON public.orders (user_id);

CREATE INDEX IF NOT EXISTS idx_orders_payos_order_code
  ON public.orders (payos_order_code);

CREATE INDEX IF NOT EXISTS idx_orders_lookup
  ON public.orders (status, lower(order_code), lower(contact));

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value integer NOT NULL CHECK (discount_value > 0),
  product_id text NULL REFERENCES public.products(id) ON DELETE CASCADE,
  duration text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS duration text NULL;

-- -----------------------------------------------------------------------------
-- 2. RPC FUNCTIONS (SECURITY DEFINER)
-- -----------------------------------------------------------------------------

-- 2.1. Đếm tồn kho khả dụng theo từng biến thể (product_id, duration, account_type)
CREATE OR REPLACE FUNCTION public.get_product_stocks()
RETURNS TABLE (
  product_id text,
  duration text,
  account_type text,
  stock bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ik.product_id,
    COALESCE(ik.duration, '1 Tháng') AS duration,
    COALESCE(ik.account_type, 'TK cấp sẵn') AS account_type,
    COUNT(*)::bigint AS stock
  FROM public.inventory_keys ik
  WHERE ik.is_sold = false
  GROUP BY
    ik.product_id,
    COALESCE(ik.duration, '1 Tháng'),
    COALESCE(ik.account_type, 'TK cấp sẵn');
$$;

REVOKE ALL ON FUNCTION public.get_product_stocks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_stocks() TO anon, authenticated;

-- 2.2. Tra cứu đơn đã thanh toán theo mã đơn hoặc thông tin liên hệ
CREATE OR REPLACE FUNCTION public.lookup_order(p_query text)
RETURNS SETOF public.orders
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.orders
  WHERE status = 'paid'
    AND LENGTH(TRIM(COALESCE(p_query, ''))) >= 5
    AND (
      LOWER(order_code) = LOWER(TRIM(p_query))
      OR LOWER(contact) = LOWER(TRIM(p_query))
    )
  ORDER BY created_at DESC
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.lookup_order(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_order(text) TO service_role;

-- 2.3. Rút đủ N key khớp biến thể & hoàn tất đơn hàng (chống tranh chấp bằng SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.fulfill_order(p_order_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  RECORD;
  v_key    RECORD;
  v_needed integer;
  v_creds  text[] := ARRAY[]::text[];
  v_joined text;
  i        integer;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE order_code = p_order_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đơn hàng %', p_order_code;
  END IF;

  IF v_order.status = 'paid' AND v_order.delivered_credential IS NOT NULL THEN
    RETURN v_order.delivered_credential;
  END IF;

  v_needed := GREATEST(1, COALESCE(v_order.quantity, 1));

  FOR i IN 1..v_needed LOOP
    -- Ưu tiên khớp chính xác cả 3 điều kiện (product_id, duration, account_type)
    SELECT * INTO v_key
    FROM public.inventory_keys
    WHERE product_id = v_order.product_id
      AND is_sold = false
      AND COALESCE(duration, '1 Tháng') = COALESCE(v_order.duration, '1 Tháng')
      AND COALESCE(account_type, 'TK cấp sẵn') = COALESCE(v_order.account_type, 'TK cấp sẵn')
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- Fallback cho key cũ chưa gắn đủ metadata biến thể
    IF NOT FOUND THEN
      SELECT * INTO v_key
      FROM public.inventory_keys
      WHERE product_id = v_order.product_id
        AND is_sold = false
        AND (duration IS NULL OR account_type IS NULL)
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kho không đủ % key cho biến thể % (% - %)',
        v_needed, v_order.product_id, v_order.duration, v_order.account_type;
    END IF;

    UPDATE public.inventory_keys
    SET is_sold = true,
        order_code = v_order.order_code
    WHERE id = v_key.id;

    v_creds := array_append(v_creds, v_key.credential);
  END LOOP;

  v_joined := array_to_string(v_creds, E'\n');

  UPDATE public.orders
  SET status = 'paid',
      delivered_credential = v_joined
  WHERE order_code = v_order.order_code;

  RETURN v_joined;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fulfill_order(text) TO service_role;

-- 2.4. Hoàn tất đơn cấp thủ công theo biến thể (idempotent & trừ manual_stocks an toàn)
CREATE OR REPLACE FUNCTION public.fulfill_manual_order(p_order_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_key   text;
  v_qty   integer;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE order_code = p_order_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đơn hàng %', p_order_code;
  END IF;

  IF v_order.status IN ('pending_manual', 'paid') THEN
    RETURN false;
  END IF;

  v_key := COALESCE(v_order.duration, '1 Tháng') || '|' || COALESCE(v_order.account_type, 'TK cấp sẵn');
  v_qty := GREATEST(1, COALESCE(v_order.quantity, 1));

  UPDATE public.products
  SET manual_stocks = jsonb_set(
    COALESCE(manual_stocks, '{}'::jsonb),
    ARRAY[v_key],
    to_jsonb(GREATEST(0, COALESCE((manual_stocks ->> v_key)::integer, 0) - v_qty)),
    true
  )
  WHERE id = v_order.product_id;

  UPDATE public.orders
  SET status = 'pending_manual',
      is_manual = true
  WHERE order_code = v_order.order_code;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_manual_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fulfill_manual_order(text) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------

-- 3.1. products: anon và authenticated được phép đọc danh sách gói
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read products" ON public.products;
CREATE POLICY "Allow anon read products"
  ON public.products
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated read products" ON public.products;
CREATE POLICY "Allow authenticated read products"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (true);

-- 3.2. inventory_keys: khóa hoàn toàn SELECT trực tiếp của anon & authenticated (chỉ đếm qua RPC get_product_stocks)
ALTER TABLE public.inventory_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read inventory_keys" ON public.inventory_keys;
REVOKE SELECT ON public.inventory_keys FROM anon, authenticated;

-- 3.3. orders: khóa INSERT trực tiếp (chỉ tạo qua Edge Function create-order); user chỉ đọc được đơn của chính mình
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read orders" ON public.orders;
DROP POLICY IF EXISTS "Allow anon insert pending orders" ON public.orders;
DROP POLICY IF EXISTS "Allow user read own orders" ON public.orders;
REVOKE INSERT ON public.orders FROM anon, authenticated;
REVOKE SELECT ON public.orders FROM anon;
GRANT SELECT ON public.orders TO authenticated;

CREATE POLICY "Allow user read own orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3.4. promo_codes: anon chỉ được đọc mã đang bật (is_active = true)
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read active promo_codes" ON public.promo_codes;
CREATE POLICY "Allow anon read active promo_codes"
  ON public.promo_codes
  FOR SELECT
  TO anon
  USING (is_active = true);
