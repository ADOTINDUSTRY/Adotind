<?php
declare(strict_types=1);

// Coolify checks the homepage through the container's loopback interface.
function site_daily_is_local_probe(array $server): bool
{
    return in_array($server['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1', '::ffff:127.0.0.1'], true)
        && in_array(strtolower($server['HTTP_HOST'] ?? ''), ['localhost', 'localhost:80'], true)
        && ($server['REQUEST_URI'] ?? '') === '/'
        && preg_match('~^(curl|wget)/~i', $server['HTTP_USER_AGENT'] ?? '') === 1;
}

// Operational counters contain only the Cyprus date, outcome and number of occurrences.
function site_daily_count(string $metric): void
{
    $dir = '/var/www/site-tracking';
    if (!is_writable($dir)) return;
    $day = (new DateTimeImmutable('now', new DateTimeZone('Asia/Nicosia')))->format('Y-m-d');
    $test = !empty($_SESSION['online_quote_unlocked']) || !empty($_SESSION['report_preview']) || ($_POST['live_preview'] ?? '') === '1';
    $group = $test ? 'testing' : 'public';
    if (website_sql_enabled()) {
        try {
            website_tracking_db($dir)->prepare('INSERT INTO operations(day,audience,metric,total) VALUES (?,?,?,1)
                ON CONFLICT(day,audience,metric) DO UPDATE SET total=total+1')->execute([$day,$group,$metric]);
        } catch (PDOException $error) {
            error_log('Website operational counter could not be updated.');
        }
        return;
    }
    $file = $dir . '/operations-' . $day . '.json';
    $lock = @fopen($file . '.lock', 'c');
    if (!$lock) return;
    $tmp = null;
    try {
        if (!flock($lock, LOCK_EX)) return;
        $totals = is_file($file) ? json_decode((string) @file_get_contents($file), true) : [];
        if (!is_array($totals)) return;
        $totals[$group][$metric] = ($totals[$group][$metric] ?? 0) + 1;
        $tmp = tempnam($dir, '.daily-');
        if ($tmp && file_put_contents($tmp, json_encode($totals)) !== false) {
            chmod($tmp, 0644);
            rename($tmp, $file);
        }
    } finally {
        if ($tmp && file_exists($tmp)) unlink($tmp);
        fclose($lock);
    }
}
