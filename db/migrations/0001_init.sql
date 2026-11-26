-- ClothFlow 1.0 — initial schema (Stage 1-4 scope + notifications/audit/settings)
-- Principles (blueprint §14-17):
--   * One PostgreSQL database; variant-level inventory; append-only movement ledger.
--   * UUID primary keys; NUMERIC money (RWF whole francs); INTEGER quantities.
--   * Unique normalized SKU/barcode (case-insensitive, trimmed).
--   * Balance projection (inventory_balances) + immutable stock_movements, always in one transaction.
--   * Sales store receipt-stable snapshots (product/variant/sku) so receipts never change after edits.
--   * Server enforces authZ; browser values are never trusted for price/stock/role.

CREATE SEQUENCE IF NOT EXISTS receipt_seq START 1000;

-- ---------- Identity & access ----------
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  email text NOT NULL,
  username text,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'cashier' CHECK (role IN ('owner', 'manager', 'stock_clerk', 'cashier')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  last_sign_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower ON users (lower(btrim(email)));
CREATE UNIQUE INDEX users_username_lower ON users (lower(btrim(username))) WHERE username IS NOT NULL;

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_user_id ON sessions (user_id);
CREATE INDEX sessions_expiry ON sessions (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

-- ---------- Catalogue ----------
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) > 0),
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_name_lower ON categories (lower(btrim(name)));

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) > 0),
  brand text,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_name_lower ON products (lower(name));
CREATE INDEX products_category ON products (category_id);

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size text NOT NULL CHECK (char_length(btrim(size)) > 0),
  colour text,
  sku text NOT NULL CHECK (char_length(btrim(sku)) > 0),
  barcode text,
  selling_price numeric(12,2) CHECK (selling_price IS NULL OR selling_price >= 0),
  reorder_level integer NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX variants_sku_lower ON product_variants (lower(btrim(sku)));
CREATE UNIQUE INDEX variants_barcode_lower ON product_variants (lower(btrim(barcode))) WHERE barcode IS NOT NULL;
CREATE INDEX variants_product_id ON product_variants (product_id);

-- ---------- Inventory (balance projection + ledger) ----------
CREATE TABLE inventory_balances (
  variant_id uuid PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity_on_hand integer NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved integer NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  quantity_damaged integer NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
  quantity_quarantined integer NOT NULL DEFAULT 0 CHECK (quantity_quarantined >= 0),
  moving_average_cost numeric(12,4) NOT NULL DEFAULT 0 CHECK (moving_average_cost >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (quantity_reserved + quantity_damaged + quantity_quarantined <= quantity_on_hand)
);

CREATE TABLE stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  actor_id uuid REFERENCES users(id),
  movement_type text NOT NULL CHECK (movement_type IN
    ('OPENING_BALANCE','STOCK_IN','SALE','RETURN','ADJUSTMENT','COUNT','DAMAGE','LOSS','REVERSAL')),
  on_hand_delta integer NOT NULL,
  reserved_delta integer NOT NULL DEFAULT 0,
  damaged_delta integer NOT NULL DEFAULT 0,
  quarantined_delta integer NOT NULL DEFAULT 0,
  before_on_hand integer,
  after_on_hand integer,
  source_type text,
  source_id uuid,
  reason text,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movements_variant_created ON stock_movements (variant_id, created_at DESC);
CREATE INDEX movements_created ON stock_movements (created_at DESC);
CREATE INDEX movements_source ON stock_movements (source_type, source_id);
CREATE INDEX movements_type ON stock_movements (movement_type);

-- ---------- Purchasing / receiving (Stage 3) ----------
CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) > 0),
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Stock-in receipts are posted directly (no draft flow in the first release; see db/README.md).
CREATE TABLE purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  reference text,
  reason text NOT NULL DEFAULT 'purchase' CHECK (reason IN
    ('opening_stock','purchase','return_from_customer','correction','transfer_in')),
  note text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('draft','received','cancelled')),
  received_by uuid REFERENCES users(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  total_cost numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchases_received_at ON purchases (received_at DESC);
CREATE INDEX purchases_reference_lower ON purchases (lower(reference)) WHERE reference IS NOT NULL;

CREATE TABLE purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(12,4) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  line_total numeric(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX purchase_items_purchase ON purchase_items (purchase_id);

-- ---------- Customers (optional; phone may also be recorded ad hoc on a sale) ----------
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text,
  email text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_phone ON customers (phone) WHERE phone IS NOT NULL;

-- ---------- Sales & POS (Stage 4) ----------
CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  cashier_id uuid NOT NULL REFERENCES users(id),
  customer_id uuid REFERENCES customers(id),
  customer_phone text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided','partially_refunded','refunded')),
  return_status text NOT NULL DEFAULT 'none' CHECK (return_status IN ('none','partial','full')),
  subtotal numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  discount_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  total numeric(12,2) NOT NULL CHECK (total >= 0),
  change_due numeric(12,2) NOT NULL DEFAULT 0,
  idempotency_key text UNIQUE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_completed_at ON sales (completed_at DESC);
CREATE INDEX sales_cashier ON sales (cashier_id);

-- Receipt-stable snapshots: product_name, variant_label and sku are copied at sale time.
CREATE TABLE sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id),
  product_id uuid,
  product_name text NOT NULL,
  variant_label text NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost numeric(12,4) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0)
);
CREATE INDEX sale_items_sale ON sale_items (sale_id);
CREATE INDEX sale_items_variant ON sale_items (variant_id);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('cash','mobile_money','card','bank_transfer')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  reference text,
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','voided')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_sale ON payments (sale_id);

-- ---------- Notifications (shared feed + per-user state) ----------
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'system',
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  title text NOT NULL,
  body text,
  action_href text,
  action_label text,
  entity_type text,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_created ON notifications (created_at DESC);
CREATE INDEX notifications_entity ON notifications (entity_type, entity_id);

CREATE TABLE notification_state (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  read_at timestamptz,
  dismissed_at timestamptz,
  PRIMARY KEY (user_id, notification_id)
);

-- ---------- Accountability ----------
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_created ON audit_logs (created_at DESC);
CREATE INDEX audit_entity ON audit_logs (entity_type, entity_id);

-- ---------- Settings ----------
CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);
INSERT INTO settings (key, value) VALUES
  ('store_name', '"ClothFlow Store"'),
  ('currency', '"RWF"'),
  ('low_stock_default', '5'),
  ('receipt_footer', '"Thank you for shopping with us"'),
  ('allowed_payment_methods', '["cash","mobile_money","card","bank_transfer"]');

-- ---------- updated_at maintenance ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER variants_updated_at BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER balances_updated_at BEFORE UPDATE ON inventory_balances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
