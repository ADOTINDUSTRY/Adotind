<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — conversion worker (CLI only).
 *
 *   php svg-trace/bin/worker.php           # cron mode: drain the queue for up to 55 s
 *   php svg-trace/bin/worker.php --drain   # same, started automatically after uploads
 *   php svg-trace/bin/worker.php --verbose # print progress
 *
 * Only one worker runs at a time (flock). Safe to run every minute from cron.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/app/lib/jobs.php';

$verbose = in_array('--verbose', $argv, true);
$log = static function (string $m) use ($verbose): void {
    if ($verbose) {
        fwrite(STDOUT, gmdate('H:i:s') . ' ' . $m . "\n");
    }
};

set_time_limit(0);
ini_set('memory_limit', '1024M');

try {
    $config = StConfig::load();
    StDb::pdo($config);
    $lock = fopen(StJobs::lockPath(), 'c');
    if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
        $log('another worker is running; exiting');
        exit(0);
    }
    // Repeat briefly so jobs queued while the last one finished are not missed.
    $total = 0;
    $deadline = time() + 55;
    do {
        $n = StJobs::drain($config, max(1, $deadline - time()), $log);
        $total += $n;
    } while ($n > 0 && time() < $deadline);
    $log("processed {$total} job(s)");
    flock($lock, LOCK_UN);
    fclose($lock);
} catch (Throwable $e) {
    error_log('[svg-trace] worker fatal: ' . $e->getMessage());
    fwrite(STDERR, 'worker error: ' . $e->getMessage() . "\n");
    exit(1);
}
