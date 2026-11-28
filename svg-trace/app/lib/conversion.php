<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/engine.php';
require_once __DIR__ . '/prep.php';
require_once __DIR__ . '/shapes.php';

final class StConversion
{
    public static function tracePrepared(string $tmpPng, string $tmpSvg, array $prep, array $settings, int $timeout, int $memMb, StConfig $config): array
    {
        // Speckle size is chosen in original pixels and the tracer sees the scaled
        // image. Palette snapping already removes noise, so scale by half to keep
        // small details such as the holes in letters.
        $engineSettings = $settings;
        $engineSettings['filter_speckle'] = StPrep::speckle((int)$settings['filter_speckle'], (float)$prep['scale']);
        $output = $settings['output'] ?? 'fill';
        // Outlines of stacked shapes would show edges hidden underneath others.
        if ($prep['cutout'] || $output === 'outline') {
            $engineSettings['hierarchical'] = 'cutout';
        }

        if ($output === 'centerline') {
            $t0 = hrtime(true);
            $cl = StLines::centreline($tmpPng, $prep['key'], $engineSettings);
            $r = ['ok' => $cl !== null, 'exit_code' => $cl !== null ? 0 : 1, 'timed_out' => false,
                  'ms' => (int)((hrtime(true) - $t0) / 1e6), 'log' => $cl !== null ? $cl['paths'] . ' lines' : 'centre-line tracing failed'];
            if ($cl !== null) {
                file_put_contents($tmpSvg, $cl['svg']);
            }
        } elseif (($settings['mode'] ?? '') === 'precise') {
            $t0 = hrtime(true);
            $sh = StShapes::trace($tmpPng, $prep['key'], $engineSettings, (float)$prep['scale']);
            $r = ['ok' => $sh !== null, 'exit_code' => $sh !== null ? 0 : 1, 'timed_out' => false,
                  'ms' => (int)((hrtime(true) - $t0) / 1e6), 'log' => $sh !== null ? $sh['paths'] . ' shapes' : 'shape tracing failed'];
            if ($sh !== null) {
                file_put_contents($tmpSvg, $sh['svg']);
            }
        } else {
            $r = StEngine::run($tmpPng, $tmpSvg, $engineSettings, $timeout, $memMb, $config);
        }
        return $r;
    }

    public static function readSvg(string $tmpSvg, array $prep, array $settings): ?string
    {
        $output = $settings['output'] ?? 'fill';
        $raw = (string)file_get_contents($tmpSvg);
        if (($settings['preset'] ?? '')==='solid' && ($settings['colormode'] ?? '')==='bw'
            && isset($settings['ink_color'])) {
            $raw=preg_replace('/(fill|stroke)="(?:#000000|#000|black)"/i','$1="'.$settings['ink_color'].'"',$raw);
        }
        if ($prep['key'] !== null && $output !== 'centerline' && ($settings['mode'] ?? '') !== 'precise') {
            $raw = StPrep::removeKey($raw, $prep['key']);
        }
        if ($output === 'outline') {
            $raw = StLines::outline($raw, max($prep['width'], $prep['height']) / 400);
        }
        return self::finaliseSvg($raw, $prep['width'], $prep['height'], $prep['source_width'], $prep['source_height']);
    }

    private static function finaliseSvg(string $svg, int $traceW, int $traceH, int $outW, int $outH): ?string
    {
        $clean = StSecurity::sanitiseSvg($svg, true);
        if ($clean === null) {
            return null;
        }
        if ($traceW > 0 && $traceH > 0) {
            $clean = preg_replace_callback('/<svg\b[^>]*>/i', static function (array $m) use ($traceW, $traceH, $outW, $outH): string {
                $tag = preg_replace('/\s(?:width|height|viewBox)="[^"]*"/i', '', $m[0]) ?? $m[0];
                return preg_replace('/^<svg\b/i', sprintf('<svg width="%d" height="%d" viewBox="0 0 %d %d"', $outW, $outH, $traceW, $traceH), $tag) ?? $tag;
            }, $clean, 1) ?? $clean;
        }
        return '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
            . '<!-- Created with A Dot SVG Trace -->' . "\n" . $clean . "\n";
    }
}
