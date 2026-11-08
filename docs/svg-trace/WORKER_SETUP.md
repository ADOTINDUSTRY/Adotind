# A Dot SVG Trace — Worker Setup

Conversions run on the server with **VTracer 0.6.4** (MIT licence), installed
outside the repository in `~/svgtrace/bin/vtracer`.

## How jobs are processed

1. An upload creates a row in `st_jobs` with status `queued`.
2. The web request immediately starts a background worker
   (`svg-trace/bin/worker.php --drain`) if none is running.
3. A cron job runs the same worker every minute as a safety net.
4. Only one worker runs at a time (`flock` on `svgtrace-storage/worker.lock`).
5. Each job is claimed atomically with a lock token and a lease
   (`job_timeout_seconds + 60`). Expired leases are re-queued, up to
   `max_attempts` (2), then marked failed.

Each engine run is limited by:

| Limit | Source | Default |
|---|---|---|
| Wall-clock timeout | `worker.job_timeout_seconds` setting + `timeout` + PHP watchdog | 120 s |
| Memory | `worker.memory_limit_mb` setting (`ulimit -v`) | 768 MB |
| CPU priority | `nice -n 10` | — |

Too-complex images fail with a clear message instead of retrying.

## One-time setup on Hostinger (SSH)

```bash
# 1. Install the engine (downloads from GitHub, verifies SHA-256, runs a smoke test)
php ~/domains/adotind.com/public_html/Adotind/svg-trace/bin/install-engine.php

# 2. Check everything
php ~/domains/adotind.com/public_html/Adotind/svg-trace/bin/check.php
```

The engine lives in `~/svgtrace/bin`, so deploys never remove it.

## Cron job (hPanel → Advanced → Cron Jobs)

- Type: **Custom**
- Command:

  ```
  /opt/alt/php82/usr/bin/php /home/u501416246/domains/adotind.com/public_html/Adotind/svg-trace/bin/worker.php
  ```

- Schedule: every minute (`* * * * *`)

`check.php` prints the exact command for the server it runs on.

## Troubleshooting

```bash
# Run the worker by hand and watch progress
php ~/domains/adotind.com/public_html/Adotind/svg-trace/bin/worker.php --verbose
```

- `another worker is running` — normal; a worker already holds the lock.
- Jobs stay `queued` — check the cron job and that the engine is installed.
- Engine errors are written to the PHP error log with the prefix `[svg-trace]`.
