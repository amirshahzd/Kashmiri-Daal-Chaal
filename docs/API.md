# API Reference

Base URL: `http://localhost:4000/api/v1`

All JSON responses:

```json
{ "success": true, "data": {} }
```

Errors:

```json
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "..." } }
```

Authenticate with `Authorization: Bearer <accessToken>` or httpOnly cookies after login.

---

## Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Customer register |
| POST | `/auth/login` | — | Login |
| POST | `/auth/refresh` | — | Refresh tokens |
| POST | `/auth/logout` | — | Revoke refresh |
| POST | `/auth/forgot-password` | — | Reset email |
| POST | `/auth/reset-password` | — | Set new password |
| GET | `/auth/me` | ✓ | Current user + roles |

**Login body**

```json
{ "email": "owner@kashmiridaalchawal.co.uk", "password": "Password123!" }
```

---

## Menu

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/menu/categories` | — | Categories |
| GET | `/menu/items?search=&category=&popular=true&new=true&offers=true` | — | List items |
| GET | `/menu/items/:slugOrId` | — | Item detail |
| POST | `/menu/items` | `menu.manage` | Create item |
| PATCH | `/menu/items/:id` | `menu.manage` | Update item |

---

## Orders

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/orders` | optional | Create order |
| GET | `/orders` | `orders.view` | Admin list |
| GET | `/orders/my` | ✓ | Customer history |
| GET | `/orders/:id` | optional | Detail + tracking history |
| PATCH | `/orders/:id/status` | `orders.manage` | Update status |
| POST | `/orders/:id/assign-driver` | `delivery.manage` | Assign driver |
| POST | `/orders/:id/reorder` | ✓ | Reorder |

**Create order**

```json
{
  "orderType": "delivery",
  "items": [{ "menuItemId": "uuid", "quantity": 2, "specialInstructions": "extra mild" }],
  "couponCode": "WELCOME10",
  "specialInstructions": "Ring bell"
}
```

Status flow: `received → accepted → preparing → cooking → ready → out_for_delivery → delivered → completed`

---

## Payments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/payments/intent` | ✓ | Create intent (Stripe/PayPal/Square/card/cash) |
| POST | `/payments/:id/confirm` | ✓ | Mark paid + invoice |
| POST | `/payments/:id/refund` | `orders.refund` | Full/partial refund |

---

## Inventory

| Method | Path | Permission |
|--------|------|------------|
| GET | `/inventory` | `inventory.view` |
| GET | `/inventory/summary` | `inventory.view` |
| GET | `/inventory/report` | `reports.view` |
| GET | `/inventory/:id` | `inventory.view` |
| POST | `/inventory/transactions` | `inventory.manage` |

Transaction types: `opening`, `purchase`, `issue`, `return`, `damage`, `adjustment`, `sale_deduction`

---

## Dashboard / HR / Reports

| Method | Path | Permission |
|--------|------|------------|
| GET | `/dashboard` | `dashboard.view` |
| GET | `/hr/employees` | `employees.view` |
| POST | `/hr/attendance/clock-in` | ✓ |
| POST | `/hr/attendance/clock-out` | ✓ |
| GET | `/hr/payroll/preview` | `payroll.manage` |
| POST | `/hr/payroll/generate` | `payroll.manage` |
| GET | `/reports/sales?period=daily\|weekly\|monthly\|yearly` | `reports.view` |
| GET | `/customers` | `customers.view` |
| GET | `/customers/me` | ✓ |
| POST | `/customers/me/addresses` | ✓ |
| POST | `/customers/me/favourites/:menuItemId` | ✓ |
| GET/POST | `/suppliers` | `suppliers.manage` |
| GET/POST | `/reviews` | public GET / auth POST |
| GET | `/branch/info` | — |

---

## Health

`GET /health` → `{ "status": "ok" }`
