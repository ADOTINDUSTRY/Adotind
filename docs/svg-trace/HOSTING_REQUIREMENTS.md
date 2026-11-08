# A Dot SVG Trace — Stage 1 Infrastructure Audit & Hosting Requirements

Status: **Stage 1 complete from the repository side. Hosting facts are UNVERIFIED until `tools/hosting-probe.php` is run on Hostinger.**
Date: 2026-11-08

## 1. What was inspected

| Item | Finding | Verified? |
|---|---|---|
| Repository | `ADOTINDUSTRY/Adotind`, **public**, branch `main`, 50 commits | Yes |
| Business site architecture | Custom PHP front controller (`index.php`), views in `app/views`, no framework, no Composer, **no database** (JSON files) | Yes |
| Business media dashboard | `/dashboard` in this repo, single admin, bcrypt hash in `app/config/site.php` | Yes |
| ERP dashboard `/my-dashboard` | **Not in this repository.** Lives in a separate `public_html/my-dashboard` folder, excluded by the root `.htaccess`. Not inspected; will not be touched | N/A |
| Deployment | Hostinger Git deployment replaces `public_html/Adotind` on each deploy. Manual (or webhook) trigger in hPanel | From earlier sessions |
| GitHub Actions | Only `deploy-pages.yml` (GitHub Pages). **Fails on every push** (Pages not enabled) and is unrelated to Hostinger | Yes |
| Persistent data | `public_html/adotind-media/` (outside the deploy folder, deny-all `.htaccess`) | Yes |
| Hostinger PHP/MySQL versions, exec, Python, cron, limits | **Unknown** — the development sandbox cannot reach adotind.com | **No** |

## 2. Engine evaluation (tested on the dev machine)

| Component | Licence | Result |
|---|---|---|
| VTracer 0.6.4 static musl binary (official release) | MIT | Colour + B/W tracing produced real `<path>` elements, zero `<image>` tags. Logo 1200×600: 88 ms. Logo 6000×3000: 2.3 s, **peak RAM 435 MB** |
| VTracer on 6000×4000 noisy photo | — | **Did not finish in 10 minutes** → hard timeouts + pre-trace simplification are mandatory |
| Potrace | GPL-2.0+ | Not bundled. Only as an optional, separately-installed CLI after licence review |
| AutoTrace (centreline) | GPL-2.0 | Rejected for bundling |
| Centreline | — | Proposed: own skeletonisation (Zhang–Suen) + graph tracing + simplification, written in Rust (MIT/Apache deps only). Shipped only when verified, otherwise marked "coming soon" |
| resvg (SVG→PNG) | Apache-2.0 | Candidate |
| svg2pdf (SVG→PDF, vector) | Apache-2.0 | Candidate |
| image / imageproc (preprocessing) | Apache-2.0 / MIT | Candidate |
| DXF | — | Own writer (LWPOLYLINE/SPLINE, R12/R2000), validated with ezdxf (MIT) in tests |

## 3. Recommended architecture

- **Web app:** PHP 8 + MySQL, new isolated folder `svg-trace/` in this repo with its own front controller, config, and views. No shared includes with the business site. Routed by one rule in `Adotind/.htaccess` before the business front controller.
- **Database:** a **separate MySQL database** (e.g. `uXXXX_svgtrace`) with its own user. Zero risk to ERP tables. All tables prefixed `st_`.
- **Secrets:** `svgtrace.env` stored **outside `public_html`** (survives deploys, never in Git).
- **Private storage:** `~/domains/adotind.com/svgtrace-storage/{originals,outputs,previews,temporary}/<user>/<project>/<random-id>` — outside the web root and outside the deploy folder.
- **Engines:** static Linux binaries (VTracer + our own Rust tool for preprocessing/centreline/PNG/PDF), built by GitHub Actions as Release assets and installed into `~/svgtrace/bin` with SHA-256 verification. No Python/pip needed on shared hosting.
- **Queue:** MySQL-backed jobs table with atomic claim (`UPDATE … WHERE status='queued' … LIMIT 1`), lock TTL, retries, timeouts, and duplicate hash check.
- **Worker:** hPanel cron every minute → `php svg-trace/bin/worker.php` (flock single instance) loops ~55 s, runs engines via `proc_open` with `timeout`, `nice`, and `ulimit` memory caps. **Concurrency 1** on shared hosting.
- **VPS migration path:** worker talks to the app via a small worker interface (DB claim locally, or HMAC-signed HTTP API remotely). Moving to a Hostinger KVM VPS later means installing the same worker there; no public-app rebuild.

## 4. Likely bottlenecks

1. Shared-hosting CPU/RAM limits (LVE). One 435 MB job at a time; photos must be downscaled/posterised before tracing.
2. Cron minimum interval (1 minute) → worker loop design required to keep latency low.
3. Disk/inode quota with 30-day retention of originals plus outputs → per-user quota + cleanup cron.
4. If `proc_open` is disabled or HOME is mounted `noexec`, **no self-hosted engine can run on shared hosting → VPS required from day one.**

## 5. How to verify the hosting (required before Stage 2)

Run once on Hostinger (SSH, or hPanel → Advanced → Cron Jobs → one-off custom command):

```
php /home/<user>/domains/adotind.com/public_html/Adotind/tools/hosting-probe.php
php /home/<user>/domains/adotind.com/public_html/Adotind/tools/hosting-probe.php --stress
```

The probe is CLI-only (returns 404 on the web, and `tools/.htaccess` denies access). It is read-only.
Paste the output back. The final architecture decision (shared hosting vs VPS worker) is made from it.

## 6. Items requiring the owner

| Item | Needed for |
|---|---|
| Probe output (above) and Hostinger plan name | Hosting decision |
| New MySQL database + user created in hPanel | Stage 2 |
| Google Cloud OAuth client (redirect `https://adotind.com/svg-trace/auth/google/callback`) | Google login |
| Meta developer app + privacy policy URL + data-deletion URL; Live mode needs business verification | Facebook login |
| Mailbox, e.g. `noreply@adotind.com` (SMTP `smtp.hostinger.com:465`) | Magic-link email |
| Decision: VPS budget if the probe fails (Hostinger KVM 1/2) | Worker |
| Legal review of privacy policy / terms drafts | GDPR |

## 7. Pre-existing issues found (not changed in Stage 1)

- The repository is public and contains the business dashboard's bcrypt password hash → move to an off-repo config file and rotate the password.
- `deploy-pages.yml` fails on every push and serves no purpose for Hostinger → disable or delete.
