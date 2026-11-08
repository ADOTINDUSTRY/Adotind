<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — setup checker (CLI only). Prints key NAMES, never values.
 *
 *   php svg-trace/bin/check.php                   # config, database, storage, SMTP reachability
 *   php svg-trace/bin/check.php --mail you@x.com  # also send a real test email
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/app/lib/config.php';
require_once dirname(__DIR__) . '/app/lib/db.php';
require_once dirname(__DIR__) . '/app/lib/storage.php';
require_once dirname(__DIR__) . '/app/lib/mailer.php';

$failures = 0;
$row = static function (string $label, bool $ok, string $detail = '') use (&$failures): void {
    if (!$ok) {
        $failures++;
    }
    printf("  [%s] %-28s %s\n", $ok ? ' OK ' : 'FAIL', $label, $detail);
};

echo "\n== Config file ==\n";
$appRoot = dirname(__DIR__);
$candidates = [
    dirname($appRoot, 3) . '/svgtrace.env',
    dirname($appRoot, 4) . '/svgtrace.env',
    $appRoot . '/svgtrace.env',
];
$found = null;
foreach ($candidates as $c) {
    if (is_file($c) && is_readable($c)) {
        $found = $c;
        break;
    }
}
$row('svgtrace.env', $found !== null, $found ?? ('not found — create ' . $candidates[0]));

$config = StConfig::load();
foreach (['SVGTRACE_DB_DSN', 'SVGTRACE_DB_USER', 'SVGTRACE_DB_PASS', 'SVGTRACE_APP_SECRET'] as $k) {
    $row($k, $config->has($k), $config->has($k) ? 'set' : 'missing');
}
if ($config->has('SVGTRACE_APP_SECRET')) {
    $row('APP_SECRET length >= 32', strlen((string)$config->get('SVGTRACE_APP_SECRET')) >= 32);
}
foreach (['MAIL_HOST', 'MAIL_PORT', 'MAIL_USERNAME', 'MAIL_PASSWORD', 'MAIL_FROM'] as $k) {
    $row($k, $config->has($k), $config->has($k) ? 'set' : 'missing (email sign-in will not work)');
}
foreach (['GOOGLE_CLIENT_ID', 'FACEBOOK_APP_ID'] as $k) {
    printf("  [info] %-28s %s\n", $k, $config->has($k) ? 'set' : 'not set (button hidden)');
}

echo "\n== Database ==\n";
try {
    StDb::pdo($config);
    $row('connect', true);
    $tables = array_column(StDb::all("SHOW TABLES LIKE 'st\\_%'"), null);
    $count = count($tables);
    $row('st_ tables (migration)', $count >= 14, $count . ' of 14 found'
        . ($count < 14 ? ' — run: mysql -u USER -p DBNAME < svg-trace/migrations/001_initial.sql' : ''));
} catch (Throwable $e) {
    $row('connect', false, $e->getMessage());
}

echo "\n== Storage ==\n";
try {
    $root = StStorage::root($config);
    StStorage::ensureLayout($config);
    $row('private storage writable', is_dir($root) && is_writable($root), $root);
} catch (Throwable $e) {
    $row('private storage writable', false, $e->getMessage());
}

echo "\n== SMTP reachability ==\n";
$targets = [[$config->get('MAIL_HOST', 'smtp.hostinger.com'), (int)$config->get('MAIL_PORT', '465')]];
if ($targets[0][0] !== 'smtp.gmail.com') {
    $targets[] = ['smtp.gmail.com', 465];
}
foreach ($targets as [$host, $port]) {
    $fp = @fsockopen('ssl://' . $host, $port, $errno, $errstr, 10);
    $greeting = is_resource($fp) ? trim((string)fgets($fp, 515)) : '';
    if (is_resource($fp)) {
        fclose($fp);
    }
    $row("{$host}:{$port}", str_starts_with($greeting, '220'), $greeting !== '' ? substr($greeting, 0, 60) : $errstr);
}

$mailIdx = array_search('--mail', $argv, true);
if ($mailIdx !== false) {
    $to = (string)($argv[$mailIdx + 1] ?? '');
    echo "\n== Test email ==\n";
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        $row('send', false, 'usage: --mail you@example.com');
    } else {
        ini_set('log_errors', '1');
        ini_set('error_log', 'php://stderr');
        $sent = StMailer::send($config, $to, 'A Dot SVG Trace test email', "This is a test email from the A Dot SVG Trace setup checker.\n");
        $row('send to ' . $to, $sent, $sent ? 'check the inbox (and spam)' : 'see the SMTP line above for the reason');
    }
}

echo "\n" . ($failures === 0 ? "All checks passed.\n" : "{$failures} check(s) failed.\n") . "\n";
exit($failures === 0 ? 0 : 1);
