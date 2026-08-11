# Kashmiri Daal Chawal

Enterprise restaurant management platform for **Kashmiri Daal Chawal** — customer ordering, kitchen display, inventory, attendance/payroll, payments, and multi-role admin.

## Stack

| Layer | Technology |
|--------|------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Node.js, Express, Zod, JWT + refresh tokens |
| Database | PostgreSQL 16 (3NF+ schema) |
| Payments | Stripe, PayPal, Square, Apple Pay, Google Pay (adapters) |
| Media | Cloudinary / S3 ready |
| Deploy | Docker Compose, Nginx, GitHub Actions |

## Quick start

### 1. Prerequisites

- Node.js 20+
- PostgreSQL 16 (or Docker Compose)
- npm 10+

### 2. Environment

```bash
cp .env.example .env
```

### 3. Database

```bash
# With Docker:
docker compose up -d postgres

# Migrate + seed
cd backend
npm install
npm run db:migrate
npm run db:seed
```

Demo accounts (after seed):

| Email | Password | Role |
|-------|----------|------|
| owner@kashmiridaalchawal.co.uk | Password123! | Owner |
| manager@kashmiridaalchawal.co.uk | Password123! | Manager |
| customer@example.com | Password123! | Customer |

### 4. Run locally

From repo root:

```bash
npm install
npm run dev
```

- Web: http://localhost:3000  
- API: http://localhost:4000/api/v1  
- Health: http://localhost:4000/health  

Or separately:

```bash
npm run dev:api
npm run dev:web
```

The Next.js site includes a full offline-capable customer experience (menu, cart, checkout, tracking, account, admin UI). Wire `NEXT_PUBLIC_API_URL` to the Express API for live data.

## Features

### Customer

- Premium landing page (hero, story, featured dishes, reviews, offers, map, hours)
- Digital menu with search, categories, popular / new / offers
- Cart, coupons, eat-in / takeaway / delivery
- Uber Eats / Deliveroo / Just Eat partner links
- Account: register, login, forgot password, order history, reorder, track
- QR table ordering (`/qr/t1`)
- Dark / light mode, EN ready with Urdu dish names

### Admin (RBAC)

Roles: Owner, Manager, Cashier, Kitchen, Delivery, Employee  

- Sales dashboard (today / week / month / year)
- Order accept / reject / refund / assign driver / kitchen ticket
- Inventory with opening / purchase / issue / return / damage / auto sale deduction
- Attendance clock-in/out, overtime, weekly payroll + payslips
- Customers, suppliers, reports (PDF/Excel/CSV endpoints)
- Kitchen Display System
- AI-style sales & stock forecasts (moving average)

### Security

- bcrypt passwords, JWT access + hashed refresh tokens
- Helmet, CORS, rate limiting, Zod validation
- RBAC permissions, audit logs
- PCI: card data never touches our servers (Stripe/PayPal/Square)

## Project layout

```
├── frontend/          Next.js customer + admin UI
├── backend/           Express REST API
├── database/
│   ├── migrations/    SQL schema
│   └── seeds/         Sample data
├── docs/              API & deployment guides
├── deploy/            Nginx config
├── .github/workflows  CI/CD
└── docker-compose.yml
```

## Tests

```bash
cd backend && npm test
```

## Documentation

- [Installation](docs/INSTALLATION.md)
- [Deployment](docs/DEPLOYMENT.md)
- [API reference](docs/API.md)
- [Database](docs/DATABASE.md)

## Licence

Proprietary — Kashmiri Daal Chawal. All rights reserved.
