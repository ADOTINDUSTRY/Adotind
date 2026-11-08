<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — install the VTracer engine (MIT licence) into ~/svgtrace/bin.
 * Downloads the official GitHub release and verifies the pinned SHA-256.
 *
 *   php svg-trace/bin/install-engine.php
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/app/lib/engine.php';

$config = StConfig::load();
$binDir = StEngine::binDir($config);
$target = StEngine::vtracerPath($config);
$url = 'https://github.com/visioncortex/vtracer/releases/download/'
    . StEngine::VTRACER_VERSION . '/' . StEngine::VTRACER_ASSET;

echo "Installing VTracer " . StEngine::VTRACER_VERSION . " into {$binDir}\n";
if (!is_dir($binDir) && !mkdir($binDir, 0750, true) && !is_dir($binDir)) {
    fwrite(STDERR, "Cannot create {$binDir}\n");
    exit(1);
}

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 5,
    CURLOPT_TIMEOUT => 120,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
    CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
]);
$data = curl_exec($ch);
$code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);
if (!is_string($data) || $code !== 200) {
    fwrite(STDERR, "Download failed (HTTP {$code}).\n");
    exit(1);
}
$hash = hash('sha256', $data);
if (!hash_equals(StEngine::VTRACER_SHA256, $hash)) {
    fwrite(STDERR, "Checksum mismatch! expected " . StEngine::VTRACER_SHA256 . " got {$hash}. Aborting.\n");
    exit(1);
}
echo "Checksum OK\n";

$work = sys_get_temp_dir() . '/svgtrace-install-' . bin2hex(random_bytes(6));
mkdir($work, 0700);
$tgz = $work . '/vtracer.tar.gz';
file_put_contents($tgz, $data);
try {
    $phar = new PharData($tgz);
    $phar->extractTo($work, 'vtracer', true);
} catch (Throwable $e) {
    fwrite(STDERR, 'Extract failed: ' . $e->getMessage() . "\n");
    exit(1);
}
$tmpBin = $target . '.new';
if (!copy($work . '/vtracer', $tmpBin) || !chmod($tmpBin, 0750) || !rename($tmpBin, $target)) {
    fwrite(STDERR, "Could not install binary to {$target}\n");
    exit(1);
}
@unlink($work . '/vtracer');
@unlink($tgz);
@rmdir($work);

// Smoke test: trace a tiny generated image.
$tmpBase = (string)tempnam(sys_get_temp_dir(), 'stpng');
$png = $tmpBase . '.png';
$svg = $png . '.svg';
$img = imagecreatetruecolor(64, 64);
imagefill($img, 0, 0, imagecolorallocate($img, 255, 255, 255));
imagefilledellipse($img, 32, 32, 40, 40, imagecolorallocate($img, 30, 50, 154));
imagepng($img, $png);
$r = StEngine::run($png, $svg, StEngine::normaliseSettings([]), 30, 512, $config);
$ok = $r['ok'] && str_contains((string)file_get_contents($svg), '<path');
@unlink($png);
@unlink($svg);
@unlink($tmpBase);
echo $ok ? "Smoke test OK ({$r['ms']} ms). Engine installed: {$target}\n"
         : "Smoke test FAILED (exit {$r['exit_code']}): {$r['log']}\n";
exit($ok ? 0 : 1);
