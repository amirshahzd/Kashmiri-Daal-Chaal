-- Kashmiri Daal Chawal — Restaurant Management System
-- Fully normalized schema (3NF+), PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending');
CREATE TYPE order_type AS ENUM ('eat_in', 'takeaway', 'delivery', 'uber_eats', 'deliveroo', 'just_eat');
CREATE TYPE order_status AS ENUM (
  'pending', 'received', 'accepted', 'rejected', 'preparing', 'cooking',
  'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'refunded'
);
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded');
CREATE TYPE payment_method AS ENUM (
  'stripe', 'paypal', 'square', 'apple_pay', 'google_pay', 'card', 'cash', 'gift_card'
);
CREATE TYPE inventory_tx_type AS ENUM (
  'opening', 'purchase', 'issue', 'return', 'damage', 'adjustment', 'sale_deduction'
);
CREATE TYPE attendance_status AS ENUM (
  'present', 'absent', 'late', 'early_leave', 'overtime',
  'holiday', 'sick_leave', 'annual_leave', 'unpaid_leave'
);
CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'push', 'in_app');
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed');

-- ============================================================
-- BRANCHES (multi-branch ready)
-- ============================================================

CREATE TABLE branches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(20) NOT NULL UNIQUE,
  name            VARCHAR(150) NOT NULL,
  slug            VARCHAR(150) NOT NULL UNIQUE,
  address_line1   VARCHAR(255) NOT NULL,
  address_line2   VARCHAR(255),
  city            VARCHAR(100) NOT NULL,
  postcode        VARCHAR(20) NOT NULL,
  country         VARCHAR(100) NOT NULL DEFAULT 'United Kingdom',
  phone           VARCHAR(30),
  email           CITEXT,
  latitude        DECIMAL(10, 7),
  longitude       DECIMAL(10, 7),
  timezone        VARCHAR(50) NOT NULL DEFAULT 'Europe/London',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  opening_hours   JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROLES & PERMISSIONS (RBAC)
-- ============================================================

CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(100) NOT NULL UNIQUE,
  module      VARCHAR(50) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           CITEXT NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  phone           VARCHAR(30),
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  avatar_url      TEXT,
  locale          VARCHAR(10) NOT NULL DEFAULT 'en',
  theme           VARCHAR(10) NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  status          user_status NOT NULL DEFAULT 'active',
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  failed_logins   INT NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

CREATE TABLE user_roles (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  branch_id  UUID REFERENCES branches(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id, branch_id)
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  device_info TEXT,
  ip_address  INET,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CUSTOMERS
-- ============================================================

CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  email           CITEXT,
  phone           VARCHAR(30),
  date_of_birth   DATE,
  loyalty_points  INT NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
  total_orders    INT NOT NULL DEFAULT 0,
  total_spent     DECIMAL(12, 2) NOT NULL DEFAULT 0,
  notes           TEXT,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_phone ON customers(phone);

CREATE TABLE customer_addresses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label           VARCHAR(50) NOT NULL DEFAULT 'Home',
  address_line1   VARCHAR(255) NOT NULL,
  address_line2   VARCHAR(255),
  city            VARCHAR(100) NOT NULL,
  postcode        VARCHAR(20) NOT NULL,
  country         VARCHAR(100) NOT NULL DEFAULT 'United Kingdom',
  latitude        DECIMAL(10, 7),
  longitude       DECIMAL(10, 7),
  delivery_notes  TEXT,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id);

-- ============================================================
-- EMPLOYEES & PAYROLL
-- ============================================================

CREATE TABLE departments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  UNIQUE (branch_id, name)
);

CREATE TABLE employees (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  branch_id       UUID NOT NULL REFERENCES branches(id),
  department_id   UUID REFERENCES departments(id),
  employee_code   VARCHAR(30) NOT NULL UNIQUE,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  email           CITEXT,
  phone           VARCHAR(30),
  photo_url       TEXT,
  role_title      VARCHAR(100) NOT NULL,
  joining_date    DATE NOT NULL,
  leaving_date    DATE,
  hourly_rate     DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tax_code        VARCHAR(20),
  ni_number       VARCHAR(30),
  bank_details_enc TEXT,
  shift_pattern   JSONB NOT NULL DEFAULT '{}'::jsonb,
  working_hours_per_week DECIMAL(5, 2) NOT NULL DEFAULT 40,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employees_branch ON employees(branch_id);

CREATE TABLE attendance_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id),
  work_date       DATE NOT NULL,
  clock_in        TIMESTAMPTZ,
  clock_out       TIMESTAMPTZ,
  scheduled_start TIME,
  scheduled_end   TIME,
  status          attendance_status NOT NULL DEFAULT 'present',
  regular_hours   DECIMAL(5, 2) NOT NULL DEFAULT 0,
  overtime_hours  DECIMAL(5, 2) NOT NULL DEFAULT 0,
  late_minutes    INT NOT NULL DEFAULT 0,
  early_leave_minutes INT NOT NULL DEFAULT 0,
  notes           TEXT,
  approved_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, work_date)
);

CREATE INDEX idx_attendance_employee_date ON attendance_records(employee_id, work_date);

CREATE TABLE payroll_periods (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, period_start, period_end)
);

CREATE TABLE payslips (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payroll_period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id),
  regular_hours   DECIMAL(8, 2) NOT NULL DEFAULT 0,
  overtime_hours  DECIMAL(8, 2) NOT NULL DEFAULT 0,
  hourly_rate     DECIMAL(10, 2) NOT NULL,
  overtime_rate   DECIMAL(10, 2) NOT NULL,
  gross_pay       DECIMAL(12, 2) NOT NULL,
  tax             DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ni_contribution DECIMAL(12, 2) NOT NULL DEFAULT 0,
  bonus           DECIMAL(12, 2) NOT NULL DEFAULT 0,
  deductions      DECIMAL(12, 2) NOT NULL DEFAULT 0,
  net_pay         DECIMAL(12, 2) NOT NULL,
  payslip_url     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payroll_period_id, employee_id)
);

-- ============================================================
-- MENU
-- ============================================================

CREATE TABLE menu_categories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id       UUID REFERENCES branches(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  name_ur         VARCHAR(100),
  slug            VARCHAR(120) NOT NULL,
  description     TEXT,
  image_url       TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, slug)
);

CREATE TABLE menu_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id     UUID NOT NULL REFERENCES menu_categories(id),
  branch_id       UUID REFERENCES branches(id),
  sku             VARCHAR(50),
  name            VARCHAR(150) NOT NULL,
  name_ur         VARCHAR(150),
  slug            VARCHAR(160) NOT NULL,
  description     TEXT,
  description_ur  TEXT,
  ingredients     TEXT[],
  allergens       TEXT[],
  price           DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  compare_at_price DECIMAL(10, 2),
  calories        INT,
  prep_time_minutes INT NOT NULL DEFAULT 15,
  image_url       TEXT,
  is_available    BOOLEAN NOT NULL DEFAULT TRUE,
  is_best_seller  BOOLEAN NOT NULL DEFAULT FALSE,
  is_new          BOOLEAN NOT NULL DEFAULT FALSE,
  is_vegetarian   BOOLEAN NOT NULL DEFAULT FALSE,
  is_halal        BOOLEAN NOT NULL DEFAULT TRUE,
  discount_percent DECIMAL(5, 2) DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  sort_order      INT NOT NULL DEFAULT 0,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, slug)
);

CREATE INDEX idx_menu_items_category ON menu_items(category_id);
CREATE INDEX idx_menu_items_available ON menu_items(is_available);
CREATE INDEX idx_menu_items_name ON menu_items USING gin (to_tsvector('english', name));

CREATE TABLE customer_favourites (
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (customer_id, menu_item_id)
);

-- ============================================================
-- SUPPLIERS & INVENTORY
-- ============================================================

CREATE TABLE suppliers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(150) NOT NULL,
  contact_name    VARCHAR(100),
  email           CITEXT,
  phone           VARCHAR(30),
  address_line1   VARCHAR(255),
  address_line2   VARCHAR(255),
  city            VARCHAR(100),
  postcode        VARCHAR(20),
  country         VARCHAR(100) DEFAULT 'United Kingdom',
  payment_terms   VARCHAR(100),
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  supplier_id     UUID REFERENCES suppliers(id),
  sku             VARCHAR(50) NOT NULL,
  name            VARCHAR(150) NOT NULL,
  category        VARCHAR(50) NOT NULL DEFAULT 'general',
  unit            VARCHAR(30) NOT NULL DEFAULT 'kg',
  opening_stock   DECIMAL(12, 3) NOT NULL DEFAULT 0,
  current_stock   DECIMAL(12, 3) NOT NULL DEFAULT 0,
  reorder_level   DECIMAL(12, 3) NOT NULL DEFAULT 0,
  cost_price      DECIMAL(12, 4) NOT NULL DEFAULT 0,
  selling_price   DECIMAL(12, 4),
  expiry_date     DATE,
  track_expiry    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, sku)
);

CREATE INDEX idx_inventory_low_stock ON inventory_items(branch_id)
  WHERE current_stock <= reorder_level;

CREATE TABLE inventory_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  tx_type         inventory_tx_type NOT NULL,
  quantity        DECIMAL(12, 3) NOT NULL,
  unit_cost       DECIMAL(12, 4),
  reference_type  VARCHAR(50),
  reference_id    UUID,
  notes           TEXT,
  performed_by    UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_tx_item ON inventory_transactions(inventory_item_id, created_at DESC);

CREATE TABLE purchase_orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  supplier_id     UUID NOT NULL REFERENCES suppliers(id),
  po_number       VARCHAR(50) NOT NULL UNIQUE,
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'sent', 'partial', 'received', 'cancelled')),
  order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date   DATE,
  subtotal        DECIMAL(12, 2) NOT NULL DEFAULT 0,
  tax_amount      DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_amount    DECIMAL(12, 2) NOT NULL DEFAULT 0,
  amount_paid     DECIMAL(12, 2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  quantity        DECIMAL(12, 3) NOT NULL,
  received_qty    DECIMAL(12, 3) NOT NULL DEFAULT 0,
  unit_cost       DECIMAL(12, 4) NOT NULL,
  line_total      DECIMAL(12, 2) NOT NULL
);

CREATE TABLE menu_item_ingredients (
  menu_item_id    UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  quantity_used   DECIMAL(12, 4) NOT NULL,
  PRIMARY KEY (menu_item_id, inventory_item_id)
);

-- ============================================================
-- COUPONS, GIFT CARDS, LOYALTY
-- ============================================================

CREATE TABLE coupons (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(50) NOT NULL UNIQUE,
  description     TEXT,
  discount_type   discount_type NOT NULL,
  discount_value  DECIMAL(10, 2) NOT NULL CHECK (discount_value > 0),
  min_order_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  max_discount    DECIMAL(10, 2),
  usage_limit     INT,
  used_count      INT NOT NULL DEFAULT 0,
  per_customer_limit INT NOT NULL DEFAULT 1,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  branch_id       UUID REFERENCES branches(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE gift_cards (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(50) NOT NULL UNIQUE,
  initial_balance DECIMAL(10, 2) NOT NULL,
  current_balance DECIMAL(10, 2) NOT NULL,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  purchased_by    UUID REFERENCES customers(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE loyalty_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  points          INT NOT NULL,
  reason          VARCHAR(100) NOT NULL,
  order_id        UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ORDERS & PAYMENTS
-- ============================================================

CREATE TABLE delivery_drivers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id     UUID REFERENCES employees(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  vehicle_info    VARCHAR(100),
  is_available    BOOLEAN NOT NULL DEFAULT TRUE,
  current_lat     DECIMAL(10, 7),
  current_lng     DECIMAL(10, 7),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number    VARCHAR(30) NOT NULL UNIQUE,
  branch_id       UUID NOT NULL REFERENCES branches(id),
  customer_id     UUID REFERENCES customers(id),
  user_id         UUID REFERENCES users(id),
  order_type      order_type NOT NULL,
  status          order_status NOT NULL DEFAULT 'pending',
  table_number    VARCHAR(20),
  subtotal        DECIMAL(12, 2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  tax_amount      DECIMAL(12, 2) NOT NULL DEFAULT 0,
  delivery_fee    DECIMAL(12, 2) NOT NULL DEFAULT 0,
  tip_amount      DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_amount    DECIMAL(12, 2) NOT NULL DEFAULT 0,
  coupon_id       UUID REFERENCES coupons(id),
  special_instructions TEXT,
  delivery_address_id UUID REFERENCES customer_addresses(id),
  delivery_address_snapshot JSONB,
  driver_id       UUID REFERENCES delivery_drivers(id),
  estimated_ready_at TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  source          VARCHAR(50) NOT NULL DEFAULT 'web',
  kds_printed     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_branch_status ON orders(branch_id, status);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_number ON orders(order_number);

CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id    UUID REFERENCES menu_items(id),
  name_snapshot   VARCHAR(150) NOT NULL,
  unit_price      DECIMAL(10, 2) NOT NULL,
  quantity        INT NOT NULL CHECK (quantity > 0),
  line_total      DECIMAL(12, 2) NOT NULL,
  special_instructions TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE order_status_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status     order_status,
  to_status       order_status NOT NULL,
  changed_by      UUID REFERENCES users(id),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id),
  amount          DECIMAL(12, 2) NOT NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'GBP',
  method          payment_method NOT NULL,
  status          payment_status NOT NULL DEFAULT 'pending',
  provider_ref    VARCHAR(255),
  provider_payload JSONB,
  refunded_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL UNIQUE REFERENCES orders(id),
  invoice_number  VARCHAR(40) NOT NULL UNIQUE,
  pdf_url         TEXT,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- REVIEWS, EXPENSES, NOTIFICATIONS
-- ============================================================

CREATE TABLE reviews (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID REFERENCES customers(id),
  order_id        UUID REFERENCES orders(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  rating          INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title           VARCHAR(150),
  comment         TEXT,
  is_published    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE expenses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  category        VARCHAR(100) NOT NULL,
  description     TEXT,
  amount          DECIMAL(12, 2) NOT NULL,
  expense_date    DATE NOT NULL,
  receipt_url     TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  channel         notification_channel NOT NULL,
  title           VARCHAR(200) NOT NULL,
  body            TEXT NOT NULL,
  data            JSONB,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- ============================================================
-- QR TABLES, SYSTEM, AUDIT
-- ============================================================

CREATE TABLE dining_tables (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  table_number    VARCHAR(20) NOT NULL,
  seats           INT NOT NULL DEFAULT 4,
  qr_code_token   VARCHAR(64) NOT NULL UNIQUE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (branch_id, table_number)
);

CREATE TABLE system_settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id       UUID REFERENCES branches(id),
  key             VARCHAR(100) NOT NULL,
  value           JSONB NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, key)
);

CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id),
  branch_id       UUID REFERENCES branches(id),
  action          VARCHAR(100) NOT NULL,
  entity_type     VARCHAR(100),
  entity_id       UUID,
  ip_address      INET,
  user_agent      TEXT,
  old_values      JSONB,
  new_values      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);

CREATE TABLE sales_forecasts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  forecast_date   DATE NOT NULL,
  predicted_sales DECIMAL(12, 2) NOT NULL,
  predicted_orders INT NOT NULL,
  model_version   VARCHAR(50),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, forecast_date)
);

-- ============================================================
-- TRIGGERS: updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_menu_items_updated BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_inventory_updated BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Inventory balance after transaction
CREATE OR REPLACE FUNCTION apply_inventory_transaction()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inventory_items
  SET current_stock = current_stock + CASE
    WHEN NEW.tx_type IN ('opening', 'purchase', 'return', 'adjustment') AND NEW.quantity > 0
      THEN NEW.quantity
    WHEN NEW.tx_type IN ('issue', 'damage', 'sale_deduction')
      THEN -ABS(NEW.quantity)
    WHEN NEW.tx_type = 'return'
      THEN ABS(NEW.quantity)
    ELSE NEW.quantity
  END,
  updated_at = NOW()
  WHERE id = NEW.inventory_item_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_tx_apply
  AFTER INSERT ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION apply_inventory_transaction();
