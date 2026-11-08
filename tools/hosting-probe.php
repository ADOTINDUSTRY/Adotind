<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — Stage 1 hosting capability probe (read-only, CLI only).
 *
 * Run on Hostinger via SSH or as a one-off hPanel cron job:
 *   php /home/<user>/domains/adotind.com/public_html/Adotind/tools/hosting-probe.php
 * Optional heavier checks (CPU/RAM/process-lifetime limits, ~90 s):
 *   php .../tools/hosting-probe.php --stress
 *
 * It changes nothing. The only file written is a tiny temporary script in HOME
 * (to test whether binaries may execute there), deleted immediately afterwards.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$stress = in_array('--stress', $argv, true);
$out = [];
$section = static function (string $title) use (&$out): void {
    $out[] = '';
    $out[] = '== ' . $title . ' ==';
};
$line = static function (string $k, $v) use (&$out): void {
    if (is_bool($v)) {
        $v = $v ? 'yes' : 'no';
    }
    $out[] = str_pad($k, 32) . ' ' . (string)$v;
};

$disabled = array_filter(array_map('trim', explode(',', (string)ini_get('disable_functions'))));
$canCall = static fn(string $fn): bool => function_exists($fn) && !in_array($fn, $disabled, true);
$run = static function (string $cmd, int $timeout = 20) use ($canCall): ?string {
    if (!$canCall('proc_open')) {
        return null;
    }
    $p = @proc_open(['/bin/sh', '-c', $cmd . ' 2>&1'], [1 => ['pipe', 'w']], $pipes);
    if (!is_resource($p)) {
        return null;
    }
    stream_set_blocking($pipes[1], false);
    $buf = '';
    $start = microtime(true);
    while (true) {
        $buf .= (string)stream_get_contents($pipes[1]);
        if (!proc_get_status($p)['running']) {
            break;
        }
        if (microtime(true) - $start > $timeout) {
            proc_terminate($p, 9);
            $buf .= ' [TIMEOUT]';
            break;
        }
        usleep(50000);
    }
    $buf .= (string)stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    proc_close($p);
    return trim($buf);
};

$appDir = dirname(__DIR__);
$publicHtml = dirname($appDir);
$domainRoot = dirname($publicHtml);
$home = (string)(getenv('HOME') ?: (function_exists('posix_getpwuid') ? (posix_getpwuid(posix_geteuid())['dir'] ?? '') : ''));

$section('PHP');
$line('PHP version', PHP_VERSION);
$line('SAPI / binary', PHP_SAPI . ' ' . PHP_BINARY);
foreach (['memory_limit', 'max_execution_time', 'upload_max_filesize', 'post_max_size', 'max_file_uploads', 'open_basedir'] as $k) {
    $v = (string)ini_get($k);
    $line($k, $v === '' ? '(none)' : $v);
}
$line('disable_functions', $disabled ? implode(',', $disabled) : '(none)');
foreach (['pdo_mysql', 'mysqli', 'gd', 'imagick', 'fileinfo', 'curl', 'openssl', 'sodium', 'mbstring', 'exif', 'zip', 'intl', 'dom', 'simplexml'] as $ext) {
    $line('ext ' . $ext, extension_loaded($ext));
}
if (extension_loaded('gd')) {
    $gd = gd_info();
    $line('gd webp / bmp', (($gd['WebP Support'] ?? false) ? 'webp ' : '') . (($gd['BMP Support'] ?? false) ? 'bmp' : ''));
}
if (extension_loaded('imagick')) {
    $line('imagick formats', implode(',', array_intersect(['PNG', 'JPEG', 'BMP', 'WEBP', 'TIFF', 'SVG', 'PDF'], \Imagick::queryFormats())));
}
foreach (['proc_open', 'exec', 'shell_exec', 'popen', 'pcntl_fork', 'posix_setrlimit'] as $fn) {
    $line('callable ' . $fn, $canCall($fn));
}

$section('Paths');
$line('app dir (Adotind)', $appDir);
$line('public_html', $publicHtml);
$line('parent of public_html', $domainRoot . (is_writable($domainRoot) ? '  [writable]' : '  [NOT writable]'));
$line('HOME', $home . ($home !== '' && is_writable($home) ? '  [writable]' : '  [NOT writable]'));
$line('sys temp dir', sys_get_temp_dir());
$line('disk free / total (app)', round((float)@disk_free_space($appDir) / 1073741824, 2) . ' GB / ' . round((float)@disk_total_space($appDir) / 1073741824, 2) . ' GB');

$section('Operating system / limits');
$line('uname', $run('uname -srm') ?? 'n/a (proc_open disabled)');
$line('nproc', $run('nproc') ?? 'n/a');
$line('meminfo', $run("grep -E 'MemTotal|MemAvailable' /proc/meminfo | tr -s ' ' | tr '\\n' ' '") ?? 'n/a');
$line('cgroup / LVE', $run('head -3 /proc/self/cgroup 2>/dev/null; ls /proc/lve 2>/dev/null | head -1') ?? 'n/a');
$line('inodes', $run('df -i ' . escapeshellarg($home ?: $appDir) . ' | tail -1') ?? 'n/a');
$line('ulimit -a', "\n" . ($run('ulimit -a') ?? 'n/a'));

$section('Tools');
foreach (['python3', 'pip3', 'node', 'git', 'composer', 'convert', 'magick', 'potrace', 'autotrace', 'inkscape', 'rsvg-convert', 'gs', 'mysql', 'flock', 'timeout', 'nice', 'curl'] as $bin) {
    $path = $run('command -v ' . escapeshellarg($bin));
    $line($bin, $path === null ? 'n/a' : ($path === '' ? '-' : $path));
}
$line('python3 --version', $run('python3 --version') ?? 'n/a');
$line('python modules', $run("python3 -c \"import importlib.util as u;print(' '.join(m+('=ok' if u.find_spec(m) else '=missing') for m in ['numpy','PIL','cv2','skimage','vtracer','ezdxf']))\"") ?? 'n/a');
$line('mysql client', $run('mysql --version') ?? 'n/a');

$section('Binary execution test (critical for tracing engines)');
if ($home !== '' && is_writable($home) && $canCall('proc_open')) {
    $probe = $home . '/.svgtrace-exec-probe-' . bin2hex(random_bytes(4));
    file_put_contents($probe, "#!/bin/sh\necho exec-ok\n");
    chmod($probe, 0700);
    $line('execute script in HOME', $run(escapeshellarg($probe)) ?? 'n/a');
    @unlink($probe);
    $line('cleanup', is_file($probe) ? 'FAILED' : 'ok');
} else {
    $line('execute script in HOME', 'skipped (HOME not writable or proc_open disabled)');
}
$line('mount options (HOME)', $run('findmnt -no OPTIONS --target ' . escapeshellarg($home ?: $appDir)) ?? 'n/a');

$section('Network (OAuth, SMTP, engine downloads)');
foreach (['https://accounts.google.com/.well-known/openid-configuration', 'https://graph.facebook.com/', 'https://github.com/'] as $url) {
    if (!extension_loaded('curl')) {
        $line((string)parse_url($url, PHP_URL_HOST), 'curl extension missing');
        continue;
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_NOBODY => true, CURLOPT_TIMEOUT => 10, CURLOPT_RETURNTRANSFER => true]);
    curl_exec($ch);
    $line((string)parse_url($url, PHP_URL_HOST), 'HTTP ' . curl_getinfo($ch, CURLINFO_HTTP_CODE));
}
$smtp = @fsockopen('ssl://smtp.hostinger.com', 465, $errno, $errstr, 8);
$line('smtp.hostinger.com:465', $smtp ? 'reachable' : 'not reachable');

if ($stress) {
    $section('Stress (resource limits)');
    $t = microtime(true);
    $x = 0.0;
    while (microtime(true) - $t < 45) {
        $x += sqrt((float)mt_rand());
    }
    $line('45 s CPU loop', 'survived');
    @ini_set('memory_limit', '1536M');
    $line('memory_limit after raise', (string)ini_get('memory_limit'));
    $blocks = [];
    $reached = 0;
    for ($i = 1; $i <= 10; $i++) {
        $blocks[] = str_repeat('x', 100 * 1048576);
        $reached = $i * 100;
    }
    $blocks = [];
    $line('RAM allocated in-process', $reached . ' MB');
    $line('child process 40 s', $run('sleep 40; echo survived', 60) ?? 'n/a');
}

$section('Done');
$line('generated (UTC)', gmdate('Y-m-d H:i:s'));
echo implode(PHP_EOL, $out) . PHP_EOL;
