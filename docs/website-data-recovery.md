# Public website data

The media mount at `/var/www/adotind-media` holds `quote-system.sqlite`, gallery images, customer uploads and drawings. The database holds machine and material rates, price settings, estimates, order requests, inquiries, quote-update signups and gallery configuration. A saved estimate has a reference of the form `Q-123`. Its snapshot records the inputs, rates, currency and price breakdown used at the time. Booked orders link back to the estimate.

The shared mount at `/var/www/site-tracking` holds `tracking.sqlite`. The public site writes it and the ERP reads it for Site Tracking. It contains daily operational totals, analytics events and daily consent records. Copying the ERP's MariaDB alone does not back up these two databases.

## Migration and verification

Deploy the database-aware ERP reader and the public site before running `php app/cli/migrate-storage.php` as the public site's PHP user. The importer holds the website storage lock, checks imported totals, checks both databases and then activates SQL storage. It can also run against copies using `php app/cli/migrate-storage.php /path/to/media-copy /path/to/tracking-copy`. Keep pre-migration files as a recovery copy. After activation they stop receiving new entries.

## Back up and restore

On the VPS, `tools/backup-website.py MEDIA_HOST_DIRECTORY TRACKING_HOST_DIRECTORY DESTINATION` uses SQLite's online backup API. It packages both databases, uploads and inquiry attachments. Seven weekday archives rotate in the destination. The VPS schedule uses `/var/backups/adotind-website`. Sessions are temporary and are excluded.

Restore into **empty staging directories** first. From the archive, place `databases/quote-system.sqlite` in the media directory and `databases/tracking.sqlite` in the tracking directory. Restore `media/uploads` and `media/inquiries` under the media directory. Use the app's PHP user for writable data. Keep any existing GeoIP lookup under `tracking/geo`, or reinstall that lookup on a new host. Run `PRAGMA integrity_check` on each restored database. Check a saved quote reference and its total, a drawing if present, and the daily ERP report. Connect the verified directories as persistent mounts for the new installation. Preserve the original mounts until the restored site is verified.

The scheduled archives are on the VPS. A separate encrypted backup destination is needed for recovery after loss of the whole VPS.
