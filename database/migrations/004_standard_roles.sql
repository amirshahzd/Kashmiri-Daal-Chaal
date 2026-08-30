-- Ensure the standard application roles exist in databases created before the seed script.

INSERT INTO roles (name, display_name, description, is_system)
VALUES
  ('customer', 'Customer', 'Customer account access', TRUE),
  ('owner', 'Owner', 'Full system access', TRUE),
  ('manager', 'Manager', 'Branch operations management', TRUE),
  ('cashier', 'Cashier', 'POS and order intake', TRUE),
  ('kitchen', 'Kitchen Staff', 'Kitchen display and prep', TRUE),
  ('delivery', 'Delivery Staff', 'Delivery assignment and tracking', TRUE),
  ('employee', 'Employee', 'Basic employee portal', TRUE)
ON CONFLICT (name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_system = TRUE;