# A Dot SVG Trace — Environment Variables

Secrets live in a file OUTSIDE the web root and OUTSIDE the deploy folder:

```
/home/<user>/domains/adotind.com/svgtrace.env
```

It survives Hostinger deploys (which replace only `public_html/Adotind`) and is
never served by the web server. Permissions: `chmod 600 svgtrace.env`.

For local development only you may place `svg-trace/svgtrace.env` (gitignored).
Real environment variables named `SVGTRACE_*` override the file.

## Required (application cannot start without these)

| Variable | Example | Purpose |
|---|---|---|
| `SVGTRACE_DB_DSN` | `mysql:host=localhost;dbname=u501416246_svgtrace;charset=utf8mb4` | PDO DSN for the dedicated database |
| `SVGTRACE_DB_USER` | `u501416246_svgtrace` | Database user |
| `SVGTRACE_DB_PASS` | `…` | Database password |
| `SVGTRACE_APP_SECRET` | 64+ random hex chars | HMAC key for tokens/signed URLs. Generate: `php -r 'echo bin2hex(random_bytes(32));'` |

## Email (magic-link sign-in) — required for email login

| Variable | Example |
|---|---|
| `MAIL_HOST` | `smtp.gmail.com` |
| `MAIL_PORT` | `465` |
| `MAIL_USERNAME` | `info@adotind.com` |
| `MAIL_PASSWORD` | 16-character Google App Password |
| `MAIL_FROM` | `info@adotind.com` (or a verified alias such as `noreply@adotind.com`) |
| `MAIL_FROM_NAME` | `A Dot SVG Trace` |

`mail()` is disabled on Hostinger — the app sends via SMTP over TLS (port 465).

**adotind.com uses Google Workspace**, so send through Gmail SMTP with the
existing `info@adotind.com` account. Do not create a Hostinger mailbox.

1. Sign in to info@adotind.com → https://myaccount.google.com/security →
   turn on **2-Step Verification**.
2. Open https://myaccount.google.com/apppasswords → create one named
   `SVG Trace` → copy the 16 letters into `MAIL_PASSWORD` (without spaces).
3. Optional `noreply@` sender (free): admin.google.com → Users → info@ →
   **Add alternate email** `noreply`; then in Gmail → Settings → Accounts →
   **Send mail as** → add `noreply@adotind.com`. Only then set
   `MAIL_FROM="noreply@adotind.com"`; otherwise Gmail rewrites the sender.

Gmail allows about 2,000 messages per day per account. Check delivery with
`php svg-trace/bin/check.php --mail you@example.com`.

## OAuth (optional until configured; buttons are hidden when absent)

| Variable | Where to get it |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth client (Web). Authorised redirect URI: `https://adotind.com/svg-trace/auth/google/callback` |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | Meta for Developers → App → Facebook Login. Valid OAuth redirect URI: `https://adotind.com/svg-trace/auth/facebook/callback`. Public use needs App Review + business verification |

## Optional overrides

| Variable | Default | Purpose |
|---|---|---|
| `SVGTRACE_STORAGE_DIR` | `/home/<user>/domains/adotind.com/svgtrace-storage` | Private file storage root (outside web root) |
| `SVGTRACE_BIN_DIR` | `/home/<user>/svgtrace/bin` | Tracing engine binaries (see WORKER_SETUP.md) |
| `SVGTRACE_PHP_CLI` | auto-detected | PHP CLI binary used to start background workers |
| `SVGTRACE_BASE_URL` | `https://adotind.com/svg-trace` | Public base URL |

## Complete starter file

```ini
SVGTRACE_DB_DSN="mysql:host=localhost;dbname=u501416246_svgtrace;charset=utf8mb4"
SVGTRACE_DB_USER="u501416246_svgtrace"
SVGTRACE_DB_PASS="change-me"
SVGTRACE_APP_SECRET="change-me-64-hex-chars"
MAIL_HOST="smtp.gmail.com"
MAIL_PORT="465"
MAIL_USERNAME="info@adotind.com"
MAIL_PASSWORD="google-app-password"
MAIL_FROM="info@adotind.com"
MAIL_FROM_NAME="A Dot SVG Trace"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
FACEBOOK_APP_ID=""
FACEBOOK_APP_SECRET=""
```
