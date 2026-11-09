<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — find out why conversions fail (CLI only).
 * Re-runs the image preparation and tracing for the most recent jobs and
 * prints each step, so the real reason is visible. Prints no secrets.
 *
 *   php svg-trace/bin/diagnose.php        # last 3 jobs
 *   php svg-trace/bin/diagnose.php 10     # last 10 jobs
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/app/lib/jobs.php';
require_once dirname(__DIR__) . '/app/lib/shapes.php';

ini_set('memory_limit', '1024M');
ini_set('display_errors', '1');
error_reporting(E_ALL);

$line = static fn(string $k, string $v) => printf("  %-26s %s\n", $k, $v);

echo "\n== PHP running this script ==\n";
$line('binary', PHP_BINARY . ' (' . PHP_VERSION . ')');
$line('gd / imagick / exif', implode(' / ', array_map(static fn($e) => extension_loaded($e) ? 'yes' : 'NO', ['gd', 'imagick', 'exif'])));

$config = StConfig::load();
$php = StJobs::phpCli($config);
echo "\n== PHP the website uses to start the worker ==\n";
$line('binary', $php ?? 'none found');
if ($php !== null && function_exists('proc_open')) {
    $p = proc_open([$php, '-r', 'echo PHP_VERSION, " gd=", extension_loaded("gd") ? "yes" : "NO", " imagick=", extension_loaded("imagick") ? "yes" : "NO";'],
        [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (is_resource($p)) {
        $out = trim((string)stream_get_contents($pipes[1]) . ' ' . (string)stream_get_contents($pipes[2]));
        proc_close($p);
        $line('version / extensions', $out);
    }
}

echo "\n== Storage and worker ==\n";
$root = StStorage::root();
$line('storage', $root . (is_writable($root) ? ' [writable]' : ' [NOT writable]'));
foreach (['originals', 'temporary', 'outputs'] as $k) {
    $d = $root . '/' . $k;
    $line($k, is_dir($d) ? (is_writable($d) ? 'ok' : 'NOT writable') : 'missing');
}
$hb = $root . '/worker.heartbeat';
$line('last worker run', is_file($hb) ? (time() - (int)@file_get_contents($hb)) . ' s ago' : 'never');
$line('engine (VTracer)', StEngine::isInstalled($config) ? 'installed' : 'NOT installed');

$n = max(1, min(20, (int)($argv[1] ?? 3)));
$jobs = StDb::all('SELECT * FROM st_jobs ORDER BY id DESC LIMIT ' . $n);
echo "\n== Last {$n} jobs ==\n";
if (!$jobs) {
    echo "  (no jobs yet)\n";
}
foreach ($jobs as $job) {
    $settings = StEngine::normaliseSettings((array)json_decode((string)$job['settings_json'], true));
    printf("\n  job %d  %s  %s  output=%s mode=%s\n", $job['id'], $job['created_at'], $job['status'],
        $settings['output'] ?? '?', $settings['mode'] ?? '?');
    if ($job['error_message']) {
        $line('error shown to user', (string)$job['error_message']);
    }
    $input = StDb::one('SELECT * FROM st_files WHERE id = ?', [$job['input_file_id']]);
    if ($input === null || $input['deleted_at'] !== null) {
        $line('input file', 'deleted');
        continue;
    }
    $src = StStorage::pathFor('originals', (string)$input['stored_name']);
    $exists = is_file($src);
    $line('input file', sprintf('%s (%s, %s bytes, %dx%d)%s', $input['original_name'], $input['format'],
        $exists ? (string)filesize($src) : 'MISSING', $input['width'], $input['height'],
        $exists ? '' : ' at ' . $src));
    if (!$exists) {
        continue;
    }
    $line('readable', is_readable($src) ? 'yes, perms ' . substr(sprintf('%o', fileperms($src)), -4) : 'NO');
    $head = (string)@file_get_contents($src, false, null, 0, 12);
    $line('first bytes', bin2hex($head));
    $info = @getimagesize($src);
    $line('getimagesize', $info ? $info[0] . 'x' . $info[1] . ' ' . $info['mime'] : 'failed');

    StStorage::ensureLayout();
    $png = StStorage::pathFor('temporary', StStorage::newStoredName('png'));
    $svg = StStorage::pathFor('temporary', StStorage::newStoredName('svg'));
    try {
        $t = microtime(true);
        $prep = StPrep::prepare($src, $png, $settings);
        if ($prep === null) {
            $line('prepare', 'FAILED: ' . StPrep::$lastError);
            continue;
        }
        $line('prepare', sprintf('ok %dx%d scale %.2f in %.1fs', $prep['width'], $prep['height'], $prep['scale'], microtime(true) - $t));
        $t = microtime(true);
        $eng = $settings;
        $eng['filter_speckle'] = StPrep::speckle((int)$settings['filter_speckle'], (float)$prep['scale']);
        if (($settings['output'] ?? '') === 'centerline') {
            $ok = StLines::centreline($png, $prep['key'], $eng) !== null;
        } elseif (($settings['mode'] ?? '') === 'precise') {
            $ok = StShapes::trace($png, $prep['key'], $eng, (float)$prep['scale']) !== null;
        } else {
            $r = StEngine::run($png, $svg, $eng, 120, 1024, $config);
            $ok = $r['ok'];
            if (!$ok) {
                $line('engine log', trim(substr($r['log'], 0, 300)));
            }
        }
        $line('trace', ($ok ? 'ok' : 'FAILED') . sprintf(' in %.1fs', microtime(true) - $t));
    } catch (Throwable $e) {
        $line('CRASH', get_class($e) . ': ' . $e->getMessage() . ' at ' . basename($e->getFile()) . ':' . $e->getLine());
    } finally {
        foreach ([$png, $svg] as $f) {
            if (is_file($f)) {
                @unlink($f);
            }
        }
    }
}

$log = $root . '/worker.log';
echo "\n== Last lines of worker.log ==\n";
if (is_file($log)) {
    $rows = array_slice(file($log, FILE_IGNORE_NEW_LINES) ?: [], -10);
    foreach ($rows as $r) {
        echo '  ', $r, "\n";
    }
} else {
    echo "  (empty)\n";
}
echo "\n";
