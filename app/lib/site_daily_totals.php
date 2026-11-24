<?php
declare(strict_types=1);

// Operational counters contain only the Cyprus date, outcome and number of occurrences.
function site_daily_count(string $metric): void
{
    $dir = '/var/www/site-tracking';
    if (!is_writable($dir)) return;
    $day = (new DateTimeImmutable('now', new DateTimeZone('Asia/Nicosia')))->format('Y-m-d');
    $file = $dir . '/operations-' . $day . '.json';
    $lock = @fopen($file . '.lock', 'c');
    if (!$lock) return;
    $tmp = null;
    try {
        if (!flock($lock, LOCK_EX)) return;
        $totals = is_file($file) ? json_decode((string) @file_get_contents($file), true) : [];
        if (!is_array($totals)) return;
        $test = !empty($_SESSION['online_quote_unlocked']) || !empty($_SESSION['report_preview']) || ($_POST['live_preview'] ?? '') === '1';
        $group = $test ? 'testing' : 'public';
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
