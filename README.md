# Adotind

Premium custom PHP website for **A Dot Industry Enterprises Ltd**.

## Architecture

- `index.php` front controller and route dispatcher
- `app/views/components` reusable header/footer
- `app/views/pages` page templates
- `app/data` structured content for services, projects, and machinery
- `public/assets` CSS and JavaScript
- `storage/inquiries` upload and inquiry log destination

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
```

## SEO files

- `robots.txt`
- `sitemap.xml`