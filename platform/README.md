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

## Implemented Phase 1 foundation

- API routing enabled (`routes/api.php`)
- Health endpoint: `GET /api/v1/health`
- Quote catalog endpoint: `GET /api/v1/quote/catalog`
- Core schema prepared for:
  - machines/materials/rates
  - customers/quotes/orders/payments
  - graphic assets/processing jobs/worklogs

## Next migration targets

1. Move existing quote calculation engine from root app into Laravel services.
2. Add auth + role model (admin/staff/customer) and dashboard APIs.
3. Add async jobs for tracing/conversion/preview pipelines.
4. Integrate payment provider webhooks (Stripe first).
