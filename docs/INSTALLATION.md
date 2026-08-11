# Installation Guide

## System requirements

- Node.js **20.x** or newer
- npm **10+**
- PostgreSQL **15+** (16 recommended)
- Optional: Docker & Docker Compose for full stack

## Step-by-step

### 1. Clone and install

```bash
cd WebPageKashmiriDaalChawal
cp .env.example .env
npm install
```

### 2. Configure `.env`

Minimum required values:

```
DATABASE_URL=postgresql://kdc:kdc_secret@localhost:5432/kashmiri_daal_chawal
JWT_ACCESS_SECRET=<32+ random characters>
JWT_REFRESH_SECRET=<different 32+ random characters>
CORS_ORIGIN=http://localhost:3000
```

Add Stripe / PayPal / Square / Cloudinary keys when going live.

### 3. Start PostgreSQL

**Docker:**

```bash
docker compose up -d postgres
```

**Local Postgres:** create database `kashmiri_daal_chawal` and user matching `DATABASE_URL`.

### 4. Migrate and seed

```bash
npm run db:migrate -w backend
npm run db:seed -w backend
```

### 5. Start apps

```bash
npm run dev
```

Open http://localhost:3000

### 6. Frontend-only (no API)

```bash
cd frontend
npm install
npm run dev
```

Menu, cart, checkout and admin UI work with embedded catalog data.

## Production build

```bash
npm run build -w backend
npm run build -w frontend
npm run start -w backend
npm run start -w frontend
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| API cannot connect to DB | Check `DATABASE_URL`, ensure Postgres is running |
| CORS errors | Set `CORS_ORIGIN` to the exact frontend origin |
| Images blocked | Confirm `images.unsplash.com` in `next.config.ts` |
| JWT errors | Rotate secrets and clear cookies / localStorage |
