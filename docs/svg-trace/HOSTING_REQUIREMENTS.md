# A Dot SVG Trace — Stage 1 Infrastructure Audit & Hosting Requirements

Status: **Stage 1 COMPLETE — hosting verified via probe on 2026-11-08.**
Date: 2026-11-08

## Verified hosting facts (from `tools/hosting-probe.php` on Hostinger)

| Capability | Result |
|---|---|
| PHP | 8.2.35 CLI (`/opt/alt/php82`), memory_limit 2048M, unlimited exec time (CLI) |
| Database | MariaDB 11.8.9, `pdo_mysql` + `mysqli` available |
| Image processing | GD (webp+bmp), **Imagick** (PNG/JPEG/BMP/WEBP/TIFF/SVG/PDF), Ghostscript |
| Process execution | **`proc_open` works; binaries in HOME execute** (exec/shell_exec/popen disabled — use proc_open only). `pcntl_fork`, `posix_setrlimit` available |
| Shell tools | git, composer, mysql, flock, timeout, nice, curl, gs. No node/pip3/convert/potrace |
| Python | 3.9.25, stdlib only (no numpy/PIL) — not used by the design |
| Filesystem | `domains/adotind.com` and HOME writable; ~7 TB free; inode usage 65% (watch) |
| Stress | 45 s CPU loop + 1 GB RAM allocation + 40 s child process all survived |
| Network | Google OAuth 200, Facebook reachable, github.com 200, smtp.hostinger.com:465 reachable |
| mail() | disabled (`mb_send_mail` in disable_functions) → app sends via SMTP TLS |

**Conclusion: no VPS required for launch. Concurrency = 1 worker.**

## Original findings (repository side)

| Item | Finding |
|---|---|
| Repository | `ADOTINDUSTRY/Adotind`, **public**, branch `main` |
| Business site | Custom PHP front controller, no framework, no DB (JSON files) |
| ERP dashboard `/my-dashboard` | Not in this repo; separate folder; untouched |
| Deployment | Hostinger Git replaces `public_html/Adotind` per deploy |
| GitHub Actions | Only `deploy-pages.yml` (fails; Pages not enabled; unrelated to Hostinger) |
| Persistent data | `public_html/adotind-media/` outside deploy folder, deny-all `.htaccess` |

## Engine evaluation (tested on the dev machine)

| Component | Licence | Result |
|---|---|---|
| VTracer 0.6.4 static musl binary | MIT | Real `<path>` output, no embedded bitmaps. Logo 1200×600: 88 ms. Logo 6000×3000: 2.3 s / 435 MB peak |
| 6000×4000 noisy photo | — | >10 min → hard timeouts + pre-trace photo simplification mandatory |
| Potrace / AutoTrace | GPL | Not bundled; optional CLI only after licence review |
| Centreline | — | Own skeletonisation engine (Rust, MIT/Apache deps); "coming soon" until verified |
| resvg / svg2pdf | Apache-2.0 | PNG / vector PDF export candidates |
| DXF | — | Own writer, validated with ezdxf (MIT) in tests |

## Recommended architecture (confirmed by probe)

- `svg-trace/` isolated folder in this repo; one `.htaccess` rule routes `/svg-trace` to it.
- Dedicated MySQL database, `st_`-prefixed tables, zero ERP contact.
- Secrets in `domains/adotind.com/svgtrace.env` (outside web root and deploy folder).
- Private storage in `domains/adotind.com/svgtrace-storage/` (outside web root).
- VTracer static binary installed in `~/svgtrace/bin` (outside web root, survives deploys).
- MySQL-backed queue; cron-per-minute worker (`flock` + `timeout` + `nice` + `ulimit`).
- VPS migration path kept clean via a worker interface (DB claim local / HMAC HTTP remote).

## Items requiring the owner

| Item | Status |
|---|---|
| Probe output + hosting verdict | ✅ done 2026-11-08 |
| New MySQL database + user (hPanel → Databases) | ⬜ needed for Stage 2 deploy |
| `noreply@adotind.com` mailbox (hPanel → Emails) | ⬜ needed for magic-link login |
| `svgtrace.env` created with secrets (instructions in ENVIRONMENT_VARIABLES.md) | ⬜ after the two above |
| hPanel cron jobs (worker + cleanup) — setup guide in WORKER_SETUP.md | ⬜ Stage 3 |
| Google OAuth client / Meta app | ⬜ optional until OAuth is enabled |
| VPS budget | ❌ not needed for launch |

## Pre-existing issues found (not changed in Stage 1)

- The repository is public and contains the business dashboard's bcrypt password hash → move to an off-repo config file and rotate the password.
- `deploy-pages.yml` fails on every push and serves no purpose for Hostinger → disable or delete.
