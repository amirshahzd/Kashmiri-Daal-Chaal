# Database Design

PostgreSQL schema in `database/migrations/001_initial_schema.sql`.

## Principles

- 3NF+ normalization
- UUID primary keys
- Foreign keys with cascading where appropriate
- Partial indexes for low stock
- Full-text index on menu names
- Audit log table for sensitive actions
- `updated_at` triggers on core entities
- Inventory balance maintained via transaction trigger

## Core domains

```
users ── user_roles ── roles ── role_permissions ── permissions
  │
  ├── customers ── addresses / favourites / loyalty
  └── employees ── attendance / payslips

branches ── menu_categories ── menu_items
         ── inventory_items ── inventory_transactions
         ── orders ── order_items / payments / invoices
         ── suppliers / purchase_orders
         ── dining_tables (QR)
```

## Example stock formula (Rice)

| Movement | Qty |
|----------|-----|
| Opening | 100 kg |
| Purchased | +50 |
| Issued | −60 |
| Returned | +5 |
| **Current** | **95 kg** |

Drinks tracked as separate SKUs (e.g. Pepsi bottles).

## Migrations

```bash
npm run db:migrate -w backend
npm run db:seed -w backend
```

Applied files recorded in `schema_migrations`.
