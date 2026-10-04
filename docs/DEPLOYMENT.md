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

Workflow `.github/workflows/ci.yml` runs on every push and every pull request. A one-line change runs the same suite as a large one. There is no path filter.

Required checks before `main` is treated as releasable:

- `backend` — unit and HTTP tests, then the API build
- `frontend` — library tests, then the Next.js build
- `e2e` — Playwright journeys on desktop and iPhone 13
- `mobile` — layout checks at 360px, iPhone 13, and Pixel 7
- `performance` — API p95 budget and mobile Lighthouse

Protect `main` in GitHub with those five check names. Pull requests never deploy.

The `deploy` job runs only after a push to `main` when every test job is green. It builds and pushes `kdc-api` and `kdc-web` when `DOCKER_USERNAME` and `DOCKER_PASSWORD` are set. If those secrets are missing, deploy is skipped and the test result still stands.

Required GitHub secrets for a real deploy:

- `DOCKER_USERNAME` / `DOCKER_PASSWORD`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` on the host `.env`
- `DATABASE_URL` on the host `.env`

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
