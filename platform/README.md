# Adotind Platform Core (Laravel)

This folder is the new scalable backend foundation for:
- quotation and pricing logic
- online ordering
- payment processing
- graphics processing jobs
- time/work tracking

The current public site remains active at repository root while these modules are migrated progressively.

## Stack baseline

- Laravel 13
- PostgreSQL (primary DB)
- Redis (queue/cache)
- S3-compatible object storage for uploaded/derived files
- API-first routes under `/api/v1/*`

## Quick start

1. Copy and adjust environment:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   composer install
   ```
3. Run migrations and seed catalog:
   ```bash
   php artisan migrate --seed
   ```
4. Start app:
   ```bash
   php artisan serve
   ```

## Implemented foundation (all requested phases)

- API routing enabled (`routes/api.php`)
- Health endpoint: `GET /api/v1/health`
- Quote catalog endpoint: `GET /api/v1/quote/catalog`
- Quote estimate endpoint: `POST /api/v1/quote/estimate`
- Auth and roles with Sanctum tokens:
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `GET /api/v1/auth/me`
  - `POST /api/v1/auth/logout`
- Quote and order flow:
  - `POST /api/v1/quotes`
  - `GET /api/v1/quotes/{quote}`
  - `POST /api/v1/quotes/{quote}/confirm`
  - `GET /api/v1/orders/{order}`
- Payments (Stripe):
  - `POST /api/v1/orders/{order}/payments/stripe/checkout`
  - `POST /api/v1/payments/stripe/webhook`
- Async graphics pipeline:
  - `POST /api/v1/graphics/assets`
  - `POST /api/v1/graphics/assets/{asset}/jobs`
  - `GET /api/v1/graphics/jobs/{processingJob}`
- Secure admin APIs:
  - `GET /api/v1/admin/dashboard`
  - `PATCH /api/v1/orders/{order}/status`

### Seeded admin account

- Email: `admin@adotind.com`
- Password: `ChangeMeNow!123`

Change the password immediately after first login in your production setup.

### Estimate API payload example

```json
{
  "machine_id": 1,
  "material_id": 1,
  "vector_length_mm": 4200,
  "part_width_mm": 500,
  "part_height_mm": 300,
  "quantity": 3
}
```

## Production notes

1. Set `STRIPE_SECRET` and `STRIPE_WEBHOOK_SECRET` before enabling checkout.
2. Run queue workers for graphics jobs:
   ```bash
   php artisan queue:work --queue=graphics,default
   ```
3. Use PostgreSQL + Redis in production (`docker-compose.yml` is included for local infra).
