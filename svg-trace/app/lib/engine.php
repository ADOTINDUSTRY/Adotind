<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — tracing engine wrapper (VTracer, MIT licence).
 *
 * The engine binary is never bundled in the repository; install it with
 * `php svg-trace/bin/install-engine.php` (SHA-256 pinned). It is spawned with
 * proc_open() using an argument array (no shell interpolation of user input),
 * under `nice`, a virtual-memory ulimit, `timeout`, and a PHP-side watchdog.
 */

require_once __DIR__ . '/config.php';

final class StEngine
{
    public const VTRACER_VERSION = '0.6.4';
    public const VTRACER_ASSET = 'vtracer-x86_64-unknown-linux-musl.tar.gz';
    public const VTRACER_SHA256 = '9290ba0c90e224d6d212836dff5491407c1718bcb72f80b2b5a4a01816df5e40';

    /** Presets shown in the workspace. Values mirror the settings schema below. */
    public const PRESETS = [
        'logo' => ['label' => 'Logo / flat colours', 'colormode' => 'color', 'hierarchical' => 'stacked', 'mode' => 'spline',
                   'output' => 'fill', 'colors' => 0, 'remove_bg' => 1, 'threshold' => 128,
                   'filter_speckle' => 4, 'color_precision' => 8, 'gradient_step' => 0,
                   'corner_threshold' => 60, 'segment_length' => 4.0, 'splice_threshold' => 45, 'path_precision' => 2],
        'cutout' => ['label' => 'Vinyl / laser cut (no overlaps)', 'colormode' => 'color', 'hierarchical' => 'cutout', 'mode' => 'spline',
                   'output' => 'fill', 'colors' => 0, 'remove_bg' => 1, 'threshold' => 128,
                   'filter_speckle' => 6, 'color_precision' => 8, 'gradient_step' => 0,
                   'corner_threshold' => 60, 'segment_length' => 4.5, 'splice_threshold' => 45, 'path_precision' => 2],
        'bw' => ['label' => 'Black & white / line art', 'colormode' => 'bw', 'hierarchical' => 'stacked', 'mode' => 'spline',
                   'output' => 'fill', 'colors' => 0, 'remove_bg' => 0, 'threshold' => 128,
                   'filter_speckle' => 4, 'color_precision' => 8, 'gradient_step' => 0,
                   'corner_threshold' => 60, 'segment_length' => 4.0, 'splice_threshold' => 45, 'path_precision' => 2],
        'technical' => ['label' => 'Technical / sharp corners (CNC)', 'colormode' => 'bw', 'hierarchical' => 'stacked', 'mode' => 'polygon',
                   'output' => 'fill', 'colors' => 0, 'remove_bg' => 0, 'threshold' => 128,
                   'filter_speckle' => 4, 'color_precision' => 8, 'gradient_step' => 0,
                   'corner_threshold' => 30, 'segment_length' => 4.0, 'splice_threshold' => 45, 'path_precision' => 2],
        'poster' => ['label' => 'Illustration / poster', 'colormode' => 'color', 'hierarchical' => 'stacked', 'mode' => 'spline',
                   'output' => 'fill', 'colors' => 16, 'remove_bg' => 0, 'threshold' => 128,
                   'filter_speckle' => 4, 'color_precision' => 8, 'gradient_step' => 0,
                   'corner_threshold' => 60, 'segment_length' => 4.0, 'splice_threshold' => 45, 'path_precision' => 2],
        'neon' => ['label' => 'Neon / centre lines (single stroke)', 'colormode' => 'color', 'hierarchical' => 'stacked', 'mode' => 'spline',
                   'output' => 'centerline', 'colors' => 0, 'remove_bg' => 2, 'threshold' => 128,
                   'filter_speckle' => 4, 'color_precision' => 8, 'gradient_step' => 0,
                   'corner_threshold' => 60, 'segment_length' => 4.0, 'splice_threshold' => 45, 'path_precision' => 2],
        'outline' => ['label' => 'Outlines only (cutting / outline neon)', 'colormode' => 'color', 'hierarchical' => 'cutout', 'mode' => 'spline',
                   'output' => 'outline', 'colors' => 0, 'remove_bg' => 2, 'threshold' => 128,
                   'filter_speckle' => 4, 'color_precision' => 8, 'gradient_step' => 0,
                   'corner_threshold' => 60, 'segment_length' => 4.0, 'splice_threshold' => 45, 'path_precision' => 2],
        'photo' => ['label' => 'Photo (artistic)', 'colormode' => 'color', 'hierarchical' => 'stacked', 'mode' => 'spline',
                   'output' => 'fill', 'colors' => 32, 'remove_bg' => 0, 'threshold' => 128,
                   'filter_speckle' => 8, 'color_precision' => 8, 'gradient_step' => 0,
                   'corner_threshold' => 180, 'segment_length' => 4.0, 'splice_threshold' => 45, 'path_precision' => 2],
    ];

    private const ENUMS = [
        'colormode' => ['color', 'bw'],
        'hierarchical' => ['stacked', 'cutout'],
        'mode' => ['spline', 'polygon', 'pixel'],
        'output' => ['fill', 'outline', 'centerline'], // filled shapes, outlines, or centre lines (neon)
    ];
    /** name => [min, max, isFloat] */
    private const RANGES = [
        'filter_speckle' => [0, 16, false], // VTracer rejects values above 16
        'color_precision' => [1, 8, false],
        'gradient_step' => [0, 255, false],
        'corner_threshold' => [0, 180, false],
        'segment_length' => [3.5, 10.0, true],
        'splice_threshold' => [0, 180, false],
        'path_precision' => [0, 8, false],
        'colors' => [0, 32, false],        // 0 = automatic
        'threshold' => [1, 254, false],    // black & white cut-off
        'remove_bg' => [0, 2, false],     // 0 off, 1 outside only, 2 everywhere
    ];

    /**
     * Validate untrusted settings into a complete canonical array (sorted keys).
     * Unknown keys are dropped; out-of-range numbers are clamped.
     *
     * @param array<string,mixed> $input
     * @return array<string,mixed>
     */
    public static function normaliseSettings(array $input): array
    {
        $presetName = is_string($input['preset'] ?? null) && isset(self::PRESETS[$input['preset']])
            ? $input['preset'] : 'logo';
        $out = self::PRESETS[$presetName];
        unset($out['label']);
        $out['preset'] = $presetName;
        foreach (self::ENUMS as $k => $allowed) {
            if (isset($input[$k]) && in_array($input[$k], $allowed, true)) {
                $out[$k] = $input[$k];
            }
        }
        foreach (self::RANGES as $k => [$min, $max, $isFloat]) {
            if (isset($input[$k]) && is_numeric($input[$k])) {
                $v = $isFloat ? (float)$input[$k] : (int)round((float)$input[$k]);
                $out[$k] = $isFloat ? round(max($min, min($max, $v)), 2) : max($min, min($max, $v));
            }
        }
        ksort($out);
        return $out;
    }

    public static function engineName(array $settings): string
    {
        if (($settings['output'] ?? 'fill') === 'centerline') {
            return 'centreline-' . ($settings['colormode'] === 'bw' ? 'bw' : 'color');
        }
        return 'vtracer-' . ($settings['colormode'] === 'bw' ? 'bw' : 'color');
    }

    public static function binDir(?StConfig $config = null): string
    {
        $config ??= StConfig::load();
        $dir = $config->get('SVGTRACE_BIN_DIR');
        if (is_string($dir) && $dir !== '') {
            return rtrim($dir, '/');
        }
        // Web SAPIs often lack $HOME, so ask the passwd database first.
        $home = function_exists('posix_getpwuid') ? (posix_getpwuid(posix_geteuid())['dir'] ?? '') : '';
        if ($home === '') {
            $home = (string)getenv('HOME');
        }
        if ($home === '') {
            $home = dirname(__DIR__, 7); // /home/<user> from .../domains/<site>/public_html/Adotind/svg-trace/app/lib
        }
        return rtrim($home, '/') . '/svgtrace/bin';
    }

    public static function vtracerPath(?StConfig $config = null): string
    {
        return self::binDir($config) . '/vtracer';
    }

    public static function isInstalled(?StConfig $config = null): bool
    {
        $p = self::vtracerPath($config);
        return is_file($p) && is_executable($p);
    }

    /** @return list<string> */
    public static function buildArgs(string $input, string $output, array $s): array
    {
        $args = [
            '--input', $input, '--output', $output,
            '--colormode', (string)$s['colormode'],
            '--mode', (string)$s['mode'],
            '--filter_speckle', (string)$s['filter_speckle'],
            '--corner_threshold', (string)$s['corner_threshold'],
            '--segment_length', (string)$s['segment_length'],
            '--splice_threshold', (string)$s['splice_threshold'],
            '--path_precision', (string)$s['path_precision'],
        ];
        if ($s['colormode'] === 'color') {
            array_push($args,
                '--hierarchical', (string)$s['hierarchical'],
                '--color_precision', (string)$s['color_precision'],
                '--gradient_step', (string)$s['gradient_step']);
        }
        return $args;
    }

    /**
     * Run VTracer. Returns status details; never throws for engine failures.
     *
     * @return array{ok:bool, exit_code:int, timed_out:bool, ms:int, log:string}
     */
    public static function run(string $input, string $output, array $settings, int $timeoutSec, int $memoryMb, ?StConfig $config = null): array
    {
        $bin = self::vtracerPath($config);
        if (!self::isInstalled($config)) {
            return ['ok' => false, 'exit_code' => -1, 'timed_out' => false, 'ms' => 0, 'log' => 'engine not installed'];
        }
        $log = tempnam(sys_get_temp_dir(), 'stlog');
        $engineCmd = array_merge([$bin], self::buildArgs($input, $output, $settings));
        $wrapped = [];
        if (is_executable('/usr/bin/timeout')) {
            $wrapped = ['/usr/bin/timeout', '-k', '5', (string)$timeoutSec];
        }
        if (is_executable('/usr/bin/nice')) {
            $wrapped = array_merge($wrapped, ['/usr/bin/nice', '-n', '10']);
        }
        // ulimit is a shell builtin: values are passed as positional args, never interpolated.
        $cmd = array_merge(
            ['/bin/sh', '-c', 'ulimit -v "$1" 2>/dev/null; shift; exec "$@"', 'sh', (string)($memoryMb * 1024)],
            $wrapped,
            $engineCmd
        );

        $start = hrtime(true);
        $proc = proc_open($cmd, [
            0 => ['file', '/dev/null', 'r'],
            1 => ['file', $log, 'w'],
            2 => ['file', $log, 'a'],
        ], $pipes);
        if (!is_resource($proc)) {
            @unlink((string)$log);
            return ['ok' => false, 'exit_code' => -1, 'timed_out' => false, 'ms' => 0, 'log' => 'proc_open failed'];
        }
        $deadline = microtime(true) + $timeoutSec + 10; // watchdog backstop
        $timedOut = false;
        $exit = -1;
        while (true) {
            $st = proc_get_status($proc);
            if (!$st['running']) {
                $exit = (int)$st['exitcode'];
                break;
            }
            if (microtime(true) > $deadline) {
                $timedOut = true;
                proc_terminate($proc, 15);
                usleep(500000);
                proc_terminate($proc, 9);
                break;
            }
            usleep(50000);
        }
        $closeCode = proc_close($proc);
        if ($exit === -1 && !$timedOut) {
            $exit = $closeCode;
        }
        $ms = (int)((hrtime(true) - $start) / 1e6);
        if ($exit === 124 || $exit === 137) {
            $timedOut = true;
        }
        $logText = substr((string)@file_get_contents((string)$log), 0, 2000);
        @unlink((string)$log);
        $ok = !$timedOut && $exit === 0 && is_file($output) && filesize($output) > 0;
        return ['ok' => $ok, 'exit_code' => $exit, 'timed_out' => $timedOut, 'ms' => $ms, 'log' => $logText];
    }
}
