# Deployment Guide

## Docker Compose (recommended)

```bash
cp .env.example .env
# Fill production secrets in .env

docker compose up -d --build
```

Services:

| Service | Port |
|---------|------|
| Nginx | 80 / 443 |
| Web (Next.js) | 3000 |
| API (Express) | 4000 |
| Postgres | 5432 |
| Redis | 6379 |

Run migrations once containers are healthy:

```bash
docker compose exec api npm run db:migrate
docker compose exec api npm run db:seed
```

## Nginx TLS

1. Obtain certificates (Let's Encrypt / ACME).
2. Mount certs into `deploy/nginx.conf` `ssl_certificate` paths.
3. Force HTTPS redirects (sample config in `deploy/nginx.conf`).

## GitHub Actions

Workflow `.github/workflows/ci.yml`:

- Install, lint, test backend
- Build frontend
- On `main` push: build & push Docker images (configure registry secrets)

Required GitHub secrets:

- `DATABASE_URL` (for migration job if used)
- `DOCKER_USERNAME` / `DOCKER_PASSWORD`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`

## Cloud checklist

- [ ] Managed Postgres with automated backups
- [ ] Object storage (Cloudinary or S3) for menu photos & invoices
- [ ] Stripe webhook endpoint `POST /api/v1/payments/webhook`
- [ ] SMTP for order / password emails
- [ ] SMS provider for delivery alerts
- [ ] CDN in front of Next.js static assets
- [ ] Daily `pg_dump` backup cron + restore runbook
- [ ] Monitoring (uptime + error tracking)

## Multi-branch

Schema already includes `branches`. Point staff `user_roles.branch_id` at the correct branch and filter dashboard queries by branch.

## Backup & restore

```bash
pg_dump $DATABASE_URL > backup-$(date +%F).sql
psql $DATABASE_URL < backup-YYYY-MM-DD.sql
```
