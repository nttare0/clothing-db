-- Stage 5-7 schema: expenses, returns, stock counts, store settings keys
CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL CHECK (char_length(btrim(category)) BETWEEN 1 AND 80),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','mobile_money','card','bank_transfer')),
  payee text,
  description text,
  entered_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_date ON expenses (expense_date DESC);
CREATE INDEX expenses_category ON expenses (lower(category));

CREATE TABLE returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id),
  processed_by uuid REFERENCES users(id),
  reason text NOT NULL DEFAULT 'customer_return',
  note text,
  refund_method text CHECK (refund_method IS NULL OR refund_method IN ('cash','mobile_money','card','bank_transfer','store_credit')),
  refund_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (refund_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX returns_sale ON returns (sale_id);
CREATE INDEX returns_created ON returns (created_at DESC);

CREATE TABLE return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  sale_item_id uuid NOT NULL REFERENCES sale_items(id),
  variant_id uuid REFERENCES product_variants(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  disposition text NOT NULL DEFAULT 'resellable' CHECK (disposition IN ('resellable','damaged','quarantine')),
  unit_refund numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_refund >= 0)
);
CREATE INDEX return_items_return ON return_items (return_id);

CREATE TABLE stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'all',
  note text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  expected integer NOT NULL CHECK (expected >= 0),
  counted integer NOT NULL CHECK (counted >= 0),
  note text
);
CREATE INDEX stock_count_items_count ON stock_count_items (count_id);

INSERT INTO settings (key, value) VALUES
  ('store_address', '""'),
  ('store_phone', '""')
ON CONFLICT (key) DO NOTHING;
