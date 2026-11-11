# Adotind

Premium website for **A Dot Industry Enterprises Ltd** with an active legacy PHP frontend and a new scalable Laravel platform core.

## Architecture

- `index.php` front controller and route dispatcher
- `app/views/components` reusable header/footer
- `app/views/pages` page templates
- `app/data` structured content for services, projects, and machinery
- `public/assets` CSS and JavaScript
- `storage/inquiries` upload and inquiry log destination
- `platform/` Laravel 13 API core for future large-scale modules (quotes, orders, payments, graphics processing, tracking)

## Current Coverage

- Premium homepage and full route structure:
  `/`, `/about`, `/services`, `/services/{slug}`, `/portfolio`,
  `/portfolio/{slug}`, `/machinery`, `/materials`, `/industries`, `/contact`
- Contact and quote form with CSRF validation, server-side validation and
  optional file upload handling
- Legacy `.html` URL redirects to clean URLs
- Placeholder project entries and machinery specs flagged for confirmation

## Run locally

Serve the repository with PHP:

```bash
php -S 127.0.0.1:8080

Run the new platform core separately:

```bash
cd platform
cp .env.example .env
composer install
php artisan migrate --seed
php artisan serve
```
```

## SEO files

- `robots.txt`
- `sitemap.xml`