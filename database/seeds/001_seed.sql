-- Seed data for Kashmiri Daal Chawal
-- Password for all demo users: Password123!

BEGIN;

INSERT INTO branches (id, code, name, slug, address_line1, city, postcode, country, phone, email, latitude, longitude, opening_hours)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'KDC-LHR-01',
  'Kashmiri Daal Chawal — Lahore',
  'lahore',
  'Hall Road',
  'Lahore',
  '54000',
  'Pakistan',
  '+92 42 3575 0000',
  'hello@kashmiridaalchawal.pk',
  31.5656000,
  74.3142000,
  '{
    "monday": {"open": "11:00", "close": "22:00"},
    "tuesday": {"open": "11:00", "close": "22:00"},
    "wednesday": {"open": "11:00", "close": "22:00"},
    "thursday": {"open": "11:00", "close": "22:00"},
    "friday": {"open": "11:00", "close": "23:00"},
    "saturday": {"open": "12:00", "close": "23:00"},
    "sunday": {"open": "12:00", "close": "21:00"}
  }'::jsonb
);

INSERT INTO roles (id, name, display_name, description, is_system) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'owner', 'Owner', 'Full system access', TRUE),
  ('b0000000-0000-4000-8000-000000000002', 'manager', 'Manager', 'Branch operations management', TRUE),
  ('b0000000-0000-4000-8000-000000000003', 'cashier', 'Cashier', 'POS and order intake', TRUE),
  ('b0000000-0000-4000-8000-000000000004', 'kitchen', 'Kitchen Staff', 'Kitchen display and prep', TRUE),
  ('b0000000-0000-4000-8000-000000000005', 'delivery', 'Delivery Staff', 'Delivery assignment and tracking', TRUE),
  ('b0000000-0000-4000-8000-000000000006', 'employee', 'Employee', 'Basic employee portal', TRUE),
  ('b0000000-0000-4000-8000-000000000007', 'customer', 'Customer', 'Customer account access', TRUE);

INSERT INTO permissions (code, module, description) VALUES
  ('dashboard.view', 'dashboard', 'View dashboard'),
  ('orders.view', 'orders', 'View orders'),
  ('orders.manage', 'orders', 'Accept/reject/update orders'),
  ('orders.refund', 'orders', 'Refund orders'),
  ('menu.view', 'menu', 'View menu'),
  ('menu.manage', 'menu', 'Manage menu items'),
  ('inventory.view', 'inventory', 'View inventory'),
  ('inventory.manage', 'inventory', 'Manage stock'),
  ('employees.view', 'hr', 'View employees'),
  ('employees.manage', 'hr', 'Manage employees'),
  ('attendance.manage', 'hr', 'Manage attendance'),
  ('payroll.manage', 'hr', 'Manage payroll'),
  ('customers.view', 'customers', 'View customers'),
  ('customers.manage', 'customers', 'Manage customers'),
  ('suppliers.manage', 'suppliers', 'Manage suppliers'),
  ('reports.view', 'reports', 'View reports'),
  ('reports.export', 'reports', 'Export reports'),
  ('settings.manage', 'settings', 'Manage settings'),
  ('kds.view', 'kds', 'Kitchen display access'),
  ('delivery.manage', 'delivery', 'Manage deliveries');

-- Owner gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'b0000000-0000-4000-8000-000000000001', id FROM permissions;

-- Manager permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'b0000000-0000-4000-8000-000000000002', id FROM permissions
WHERE code NOT IN ('settings.manage', 'payroll.manage');

-- Cashier
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'b0000000-0000-4000-8000-000000000003', id FROM permissions
WHERE code IN ('dashboard.view', 'orders.view', 'orders.manage', 'menu.view', 'customers.view');

-- Kitchen
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'b0000000-0000-4000-8000-000000000004', id FROM permissions
WHERE code IN ('orders.view', 'kds.view', 'menu.view');

-- Delivery
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'b0000000-0000-4000-8000-000000000005', id FROM permissions
WHERE code IN ('orders.view', 'delivery.manage');

-- bcrypt hash for Password123!
INSERT INTO users (id, email, password_hash, first_name, last_name, status, email_verified_at) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'owner@kashmiridaalchawal.pk',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.G2oQ.YvKxqKxqK', 'Aamir', 'Khan', 'active', NOW()),
  ('c0000000-0000-4000-8000-000000000002', 'manager@kashmiridaalchawal.pk',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.G2oQ.YvKxqKxqK', 'Sara', 'Ahmed', 'active', NOW()),
  ('c0000000-0000-4000-8000-000000000003', 'customer@example.com',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.G2oQ.YvKxqKxqK', 'Ali', 'Raza', 'active', NOW());

-- Note: Real bcrypt will be generated at seed runtime in Node. Placeholder above replaced by seed script.

INSERT INTO user_roles (user_id, role_id, branch_id) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001');

INSERT INTO customers (id, user_id, first_name, last_name, email, phone, loyalty_points) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003',
   'Ali', 'Raza', 'customer@example.com', '+44 7700 900123', 250);

INSERT INTO customer_addresses (customer_id, label, address_line1, city, postcode, country, is_default) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'Home', '12 Mall Road', 'Lahore', '54000', 'Pakistan', TRUE);

INSERT INTO departments (id, branch_id, name) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Kitchen'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Front of House'),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Delivery');

INSERT INTO menu_categories (id, branch_id, name, name_ur, slug, description, sort_order) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Mains', 'مین کورس', 'mains', 'Hearty Kashmiri favourites', 1),
  ('f0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'Sides', 'ساتھ', 'sides', 'Perfect companions', 2),
  ('f0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
   'Drinks', 'مشروبات', 'drinks', 'Cold drinks & refreshments', 3);

INSERT INTO menu_items (
  id, category_id, branch_id, sku, name, name_ur, slug, description, description_ur,
  ingredients, allergens, price, calories, prep_time_minutes, image_url,
  is_available, is_best_seller, is_new, is_vegetarian, is_halal, discount_percent, sort_order
) VALUES
  ('11000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'MAIN-001',
   'Boiled Rice', 'ابلا ہوا چاول', 'boiled-rice',
   'Fragrant long-grain basmati rice, steamed to perfection — the foundation of every Kashmiri plate.',
   'خوشبودار باسمتی چاول، مکمل طور پر بھاپ میں پکائے گئے۔',
   ARRAY['Basmati rice', 'Salt', 'Water'],
   ARRAY[]::TEXT[],
   250, 210, 10,
   '/images/menu/boiled-rice.jpg', TRUE, TRUE, FALSE, TRUE, TRUE, 0, 1),

  ('11000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'MAIN-002',
   'Daal', 'دال', 'daal',
   'Slow-cooked yellow lentils tempered with cumin, garlic and Kashmiri spices. Comfort in a bowl.',
   ' زیر آہستہ پکی ہوئی دال، زیرہ لہسن اور کشمیری مصالحوں کے ساتھ۔',
   ARRAY['Yellow lentils', 'Cumin', 'Garlic', 'Turmeric', 'Onion', 'Ghee'],
   ARRAY['Dairy (ghee)'],
   320, 280, 20,
   '/images/menu/daal.jpg', TRUE, TRUE, FALSE, TRUE, TRUE, 0, 2),

  ('11000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'MAIN-003',
   'Chicken Pulao', 'چکن پلاؤ', 'chicken-pulao',
   'Tender chicken and basmati rice cooked together with whole spices and caramelised onions.',
   'نرم چکن اور باسمتی چاول مصالحوں اور پیاز کے ساتھ۔',
   ARRAY['Chicken', 'Basmati rice', 'Onion', 'Bay leaf', 'Cinnamon', 'Cardamom'],
   ARRAY[]::TEXT[],
   550, 520, 30,
   '/images/menu/chicken-pulao.jpg', TRUE, TRUE, FALSE, FALSE, TRUE, 10, 3),

  ('11000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'MAIN-004',
   'Chicken Biryani', 'چکن بریانی', 'chicken-biryani',
   'Layered aromatic biryani with marinated chicken, saffron milk and fried onions. Our signature dish.',
   ' مصالحے والے چکن، زعفران اور تلا ہوا پیاز کی لہریں۔ ہمارا مشہور پکوان۔',
   ARRAY['Chicken', 'Basmati rice', 'Yogurt', 'Saffron', 'Fried onion', 'Biryani masala'],
   ARRAY['Dairy (yogurt)'],
   650, 650, 40,
   '/images/menu/chicken-biryani.jpg', TRUE, TRUE, TRUE, FALSE, TRUE, 0, 4),

  ('11000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000001', 'SIDE-001',
   'Shami Kebab', 'شامی کباب', 'shami-kebab',
   'Finely minced meat and lentil patties, shallow-fried until golden. Crisp outside, soft inside.',
   'باریک قیمہ اور دال کے کباب، سنہری تلے ہوئے۔',
   ARRAY['Minced beef', 'Chana dal', 'Egg', 'Onion', 'Garam masala'],
   ARRAY['Egg'],
   380, 320, 15,
   '/images/menu/shami-kebab.jpg', TRUE, FALSE, FALSE, FALSE, TRUE, 0, 5);

INSERT INTO menu_items (
  id, category_id, branch_id, sku, name, slug, description, ingredients, allergens,
  price, calories, prep_time_minutes, image_url, is_available, is_halal, sort_order
) VALUES
  ('11000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000003',
   'a0000000-0000-4000-8000-000000000001', 'DRINK-001', 'Mineral Water', 'mineral-water',
   'Still mineral water 500ml.', ARRAY['Water'], ARRAY[]::TEXT[], 60, 0, 1,
   '/images/menu/mineral-water.jpg', TRUE, TRUE, 1),
  ('11000000-0000-4000-8000-000000000012', 'f0000000-0000-4000-8000-000000000003',
   'a0000000-0000-4000-8000-000000000001', 'DRINK-002', 'Coca-Cola', 'coca-cola',
   'Classic Coca-Cola 330ml.', ARRAY['Carbonated water', 'Sugar'], ARRAY[]::TEXT[], 100, 139, 1,
   '/images/menu/coca-cola.jpg', TRUE, TRUE, 2),
  ('11000000-0000-4000-8000-000000000013', 'f0000000-0000-4000-8000-000000000003',
   'a0000000-0000-4000-8000-000000000001', 'DRINK-003', 'Pepsi', 'pepsi',
   'Pepsi 330ml.', ARRAY['Carbonated water', 'Sugar'], ARRAY[]::TEXT[], 100, 141, 1,
   '/images/menu/pepsi.jpg', TRUE, TRUE, 3),
  ('11000000-0000-4000-8000-000000000014', 'f0000000-0000-4000-8000-000000000003',
   'a0000000-0000-4000-8000-000000000001', 'DRINK-004', '7UP', '7up',
   'Refreshing lemon-lime 330ml.', ARRAY['Carbonated water', 'Sugar'], ARRAY[]::TEXT[], 100, 136, 1,
   '/images/menu/7up.jpg', TRUE, TRUE, 4),
  ('11000000-0000-4000-8000-000000000015', 'f0000000-0000-4000-8000-000000000003',
   'a0000000-0000-4000-8000-000000000001', 'DRINK-005', 'Sprite', 'sprite',
   'Sprite 330ml.', ARRAY['Carbonated water', 'Sugar'], ARRAY[]::TEXT[], 100, 136, 1,
   '/images/menu/sprite.jpg', TRUE, TRUE, 5),
  ('11000000-0000-4000-8000-000000000016', 'f0000000-0000-4000-8000-000000000003',
   'a0000000-0000-4000-8000-000000000001', 'DRINK-006', 'Diet Coke', 'diet-coke',
   'Diet Coke 330ml.', ARRAY['Carbonated water', 'Sweeteners'], ARRAY[]::TEXT[], 100, 1, 1,
   '/images/menu/diet-coke.jpg', TRUE, TRUE, 6),
  ('11000000-0000-4000-8000-000000000017', 'f0000000-0000-4000-8000-000000000003',
   'a0000000-0000-4000-8000-000000000001', 'DRINK-007', 'Fanta', 'fanta',
   'Orange Fanta 330ml.', ARRAY['Carbonated water', 'Orange juice'], ARRAY[]::TEXT[], 100, 145, 1,
   '/images/menu/fanta.jpg', TRUE, TRUE, 7),
  ('11000000-0000-4000-8000-000000000018', 'f0000000-0000-4000-8000-000000000003',
   'a0000000-0000-4000-8000-000000000001', 'DRINK-008', 'Tango', 'tango',
   'Tango Orange 330ml.', ARRAY['Carbonated water', 'Orange'], ARRAY[]::TEXT[], 100, 140, 1,
   '/images/menu/tango.jpg', TRUE, TRUE, 8),
  ('11000000-0000-4000-8000-000000000019', 'f0000000-0000-4000-8000-000000000003',
   'a0000000-0000-4000-8000-000000000001', 'DRINK-009', 'Rubicon', 'rubicon',
   'Rubicon Mango 330ml.', ARRAY['Carbonated water', 'Mango'], ARRAY[]::TEXT[], 120, 150, 1,
   '/images/menu/rubicon.jpg', TRUE, TRUE, 9);

INSERT INTO suppliers (id, name, contact_name, email, phone, city, postcode, country) VALUES
  ('12000000-0000-4000-8000-000000000001', 'Lahore Fresh Foods', 'Imran Malik',
   'orders@lahorefresh.pk', '+92 42 111 222 333', 'Lahore', '54000', 'Pakistan'),
  ('12000000-0000-4000-8000-000000000002', 'Punjab Soft Drinks Wholesale', 'Usman Ali',
   'sales@punjabdrinks.pk', '+92 42 3571 8899', 'Lahore', '54000', 'Pakistan');

INSERT INTO inventory_items (id, branch_id, supplier_id, sku, name, category, unit, opening_stock, current_stock, reorder_level, cost_price, selling_price) VALUES
  ('13000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000001', 'INV-RICE', 'Basmati Rice', 'dry', 'kg', 100, 95, 20, 280, 250),
  ('13000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000001', 'INV-DAAL', 'Yellow Lentils', 'dry', 'kg', 50, 42, 10, 220, 320),
  ('13000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000001', 'INV-CHICKEN', 'Halal Chicken', 'protein', 'kg', 40, 28, 8, 650, NULL),
  ('13000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000002', 'INV-PEPSI', 'Pepsi Bottles', 'drinks', 'bottle', 120, 88, 24, 55, 100),
  ('13000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001',
   '12000000-0000-4000-8000-000000000002', 'INV-COKE', 'Coca-Cola Bottles', 'drinks', 'bottle', 120, 95, 24, 55, 100);

-- Sample inventory movements (rice example)
INSERT INTO inventory_transactions (inventory_item_id, branch_id, tx_type, quantity, notes) VALUES
  ('13000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'opening', 100, 'Opening stock'),
  ('13000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'purchase', 50, 'Weekly delivery'),
  ('13000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'issue', 60, 'Kitchen issue'),
  ('13000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'return', 5, 'Unused return');

INSERT INTO coupons (code, description, discount_type, discount_value, min_order_amount, starts_at, ends_at) VALUES
  ('WELCOME10', '10% off first order', 'percentage', 10, 1000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '90 days'),
  ('BIRYANI200', 'Rs 200 off Biryani combo', 'fixed', 200, 1000, NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days');

INSERT INTO reviews (customer_id, branch_id, rating, title, comment, is_published) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 5,
   'Best daal chawal on Hall Road',
   'The chicken biryani tastes like home. Generous portions and friendly staff.', TRUE),
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 5,
   'Proper Kashmiri flavours',
   'Came for daal rice, stayed for the shami kebabs. Will order again.', TRUE);

INSERT INTO dining_tables (branch_id, table_number, seats, qr_code_token) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'T1', 4, 'qr-table-t1-kdc'),
  ('a0000000-0000-4000-8000-000000000001', 'T2', 4, 'qr-table-t2-kdc'),
  ('a0000000-0000-4000-8000-000000000001', 'T3', 6, 'qr-table-t3-kdc');

INSERT INTO system_settings (branch_id, key, value) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'branding', '{"name":"Kashmiri Daal Chawal","primary":"#C41E3A","accent":"#D4AF37"}'::jsonb),
  ('a0000000-0000-4000-8000-000000000001', 'delivery_fee', '{"flat":150,"free_above":2000}'::jsonb),
  ('a0000000-0000-4000-8000-000000000001', 'tax_rate', '{"sales_tax_percent":5}'::jsonb),
  ('a0000000-0000-4000-8000-000000000001', 'loyalty', '{"points_per_100_rupees":1,"redeem_rate":100}'::jsonb);

COMMIT;
