<?php
declare(strict_types=1);

require_once __DIR__ . '/lines.php';
require_once __DIR__ . '/import.php';

/*
 * A Dot SVG Trace — image preparation before tracing (GD only).
 *
 * Tracers produce blobby, noisy output from small, compressed or
 * anti-aliased images. This step:
 *   1. applies EXIF rotation;
 *   2. flattens transparency onto a unique "key" colour (VTracer's own alpha
 *      handling falls apart on many logos), stripped from the SVG afterwards;
 *   3. upscales small images (max 4x, ~2000 px) and caps huge ones (~8 MP);
 *   4. blurs in proportion to the scale so stair-step edges become smooth;
 *   5. snaps every pixel to a small clean palette (auto-detected or fixed),
 *      or to pure black/white with an adjustable threshold;
 *   6. optionally turns the background connected to the border into key colour.
 */

final class StPrep
{
    private const TARGET_SIDE = 2000;
    private const MAX_UPSCALE = 4.0;
    private const MAX_WORK_PIXELS = 8_000_000;
    private const AUTO_MAX_COLORS = 16;
    private const KEY_CANDIDATES = [[255, 0, 255], [0, 255, 0], [0, 255, 255], [255, 255, 0], [255, 0, 0], [0, 0, 255]];

    /**
     * @param array<string,mixed> $s normalised settings
     * @return array{width:int,height:int,source_width:int,source_height:int,scale:float,key:?string,cutout:bool,colors:int}|null
     */
    public static function prepare(string $src, string $dest, array $s): ?array
    {
        $img = StImport::openGd($src);
        if ($img === null) {
            return null;
        }
        $img = self::exifRotate($img, $src);
        if (!imageistruecolor($img)) {
            imagepalettetotruecolor($img);
        }
        $w = imagesx($img);
        $h = imagesy($img);
        $bw = ($s['colormode'] ?? 'color') === 'bw';
        $pixelMode = ($s['mode'] ?? '') === 'pixel';

        $sample = self::sample($img);
        $hasAlpha = $sample['alpha'];
        $palette = $bw ? [[0, 0, 0], [255, 255, 255]] : self::palette($sample['pixels'], (int)($s['colors'] ?? 0));
        $wantKey = $hasAlpha || (!$bw && (int)($s['remove_bg'] ?? 0) > 0);
        $key = $wantKey ? self::pickKey($palette) : null;

        // Flatten transparency (onto white for B&W, onto the key colour otherwise).
        if ($hasAlpha) {
            $flat = imagecreatetruecolor($w, $h);
            $bg = $bw || $key === null ? [255, 255, 255] : $key;
            imagefill($flat, 0, 0, imagecolorallocate($flat, ...$bg));
            imagealphablending($flat, true);
            imagecopy($flat, $img, 0, 0, 0, 0, $w, $h);
            $img = $flat;
        }

        // Working resolution. Centre-line tracing runs in PHP, so it works smaller.
        $scale = 1.0;
        $lines = ($s['output'] ?? 'fill') === 'centerline';
        $target = $lines ? StLines::WORK_SIDE : self::TARGET_SIDE;
        $maxPx = $lines ? StLines::MAX_WORK_PIXELS : self::MAX_WORK_PIXELS;
        if (!$pixelMode) {
            $up = min(self::MAX_UPSCALE, $target / max($w, $h));
            if ($up >= 1.25) {
                $scale = $up;
            } elseif ($w * $h > $maxPx) {
                $scale = sqrt($maxPx / ($w * $h));
            }
        }
        if ($scale !== 1.0) {
            $scaled = imagescale($img, max(1, (int)round($w * $scale)), max(1, (int)round($h * $scale)), IMG_BICUBIC);
            if ($scaled === false) {
                return null;
            }
            $img = $scaled;
        }
        $ww = imagesx($img);
        $wh = imagesy($img);

        if (!$pixelMode) {
            $passes = max(1, (int)round($scale));
            for ($i = 0; $i < $passes; $i++) {
                imagefilter($img, IMG_FILTER_GAUSSIAN_BLUR);
            }
        }

        if ($bw) {
            imagefilter($img, IMG_FILTER_GRAYSCALE);
            // Shift brightness so the fixed 50 % midpoint becomes the chosen threshold.
            $shift = 128 - (int)($s['threshold'] ?? 128);
            if ($shift !== 0) {
                imagefilter($img, IMG_FILTER_BRIGHTNESS, $shift);
            }
        }

        // Snap to palette: GD maps each pixel to the closest entry when no slot is free.
        $entries = $palette;
        if ($key !== null && !$bw) {
            $entries[] = $key;
        }
        $pal = imagecreate($ww, $wh);
        foreach ($entries as $c) {
            imagecolorallocate($pal, ...$c);
        }
        // Edge pixels are blends of two neighbouring colours and can sit closer
        // to an unrelated third colour (pink text edges -> yellow). Extra entries
        // along each colour pair attract those blends and are then recoloured
        // to the nearer end of their pair.
        $recolour = [];
        $n = count($entries);
        $pairs = intdiv($n * ($n - 1), 2);
        $k = $pairs > 0 ? min(12, intdiv(255 - $n, $pairs)) : 0;
        if ($k >= 2) {
            for ($a = 0; $a < $n; $a++) {
                for ($b = $a + 1; $b < $n; $b++) {
                    for ($j = 0; $j < $k; $j++) {
                        $t = ($j + 0.5) / $k;
                        $mix = [];
                        for ($ch = 0; $ch < 3; $ch++) {
                            $mix[] = (int)round($entries[$a][$ch] * (1 - $t) + $entries[$b][$ch] * $t);
                        }
                        $recolour[imagecolorallocate($pal, ...$mix)] = $entries[$t < 0.5 ? $a : $b];
                    }
                }
            }
        }
        for ($i = imagecolorstotal($pal); $i < 256; $i++) {
            imagecolorallocate($pal, ...$entries[0]);
        }
        imagecopy($pal, $img, 0, 0, 0, 0, $ww, $wh);
        unset($img);
        if ($recolour) {
            foreach ($recolour as $idx => $c) {
                imagecolorset($pal, $idx, ...$c);
            }
            // Collapse duplicate entries so flood fills see one index per colour.
            $flat = imagecreate($ww, $wh);
            foreach ($entries as $c) {
                imagecolorallocate($flat, ...$c);
            }
            imagecopy($flat, $pal, 0, 0, 0, 0, $ww, $wh);
            $pal = $flat;
        }

        if ($key !== null && !$bw && (int)($s['remove_bg'] ?? 0) > 0) {
            self::keyBackground($pal, count($entries) - 1, (int)$s['remove_bg'] === 2);
        }

        imagepalettetotruecolor($pal);
        if (!imagepng($pal, $dest, 1)) {
            return null;
        }
        return [
            'width' => $ww,
            'height' => $wh,
            'source_width' => $w,
            'source_height' => $h,
            'scale' => $scale,
            'key' => $key !== null && !$bw ? sprintf('#%02x%02x%02x', ...$key) : null,
            // Stacked tracing paints shapes under transparent areas; cut-out does not.
            'cutout' => ($hasAlpha || (int)($s['remove_bg'] ?? 0) === 2) && !$bw && $key !== null,
            'colors' => count($palette),
        ];
    }

    /** Remove SVG shapes whose fill is (close to) the key colour. */
    /** Tracer speckle size for an image scaled by $scale. */
    public static function speckle(int $speckle, float $scale): int
    {
        return min(16, max($speckle, (int)round($speckle * $scale / 2)));
    }

    /**
     * Remove shapes painted in the key colour. A key shape that sits inside another
     * shape (the hole in an "O") is first added to that shape as an even-odd hole,
     * because stacked tracing paints the letter solid underneath its hole.
     */
    public static function removeKey(string $svg, string $keyHex): string
    {
        $k = sscanf($keyHex, '#%02x%02x%02x');
        if (!preg_match_all('/<path\b[^>]*\/>\s*/i', $svg, $m, PREG_OFFSET_CAPTURE)) {
            return $svg;
        }
        $paths = [];
        foreach ($m[0] as [$tag, $off]) {
            if (!preg_match('/\bd="([^"]*)"/', $tag, $d) || !preg_match('/\bfill="#([0-9a-f]{6})"/i', $tag, $f)) {
                $paths[] = ['tag' => $tag, 'off' => $off, 'key' => false, 'box' => null];
                continue;
            }
            $c = sscanf($f[1], '%02x%02x%02x');
            $tx = $ty = 0.0;
            if (preg_match('/\btransform="translate\(([-\d.]+),\s*([-\d.]+)\)"/', $tag, $t)) {
                $tx = (float)$t[1];
                $ty = (float)$t[2];
            }
            // Control points sit close enough to the curve for containment tests.
            $rings = self::rings($d[1], $tx, $ty);
            $all = $rings ? array_merge(...$rings) : [];
            $box = $all ? [min(array_column($all, 0)), min(array_column($all, 1)), max(array_column($all, 0)), max(array_column($all, 1))] : null;
            $paths[] = [
                'tag' => $tag, 'off' => $off, 'd' => $d[1], 'tx' => $tx, 'ty' => $ty, 'box' => $box, 'rings' => $rings,
                'key' => (($c[0] - $k[0]) ** 2 + ($c[1] - $k[1]) ** 2 + ($c[2] - $k[2]) ** 2) < 3600,
                'holes' => '',
            ];
        }

        foreach ($paths as $i => $p) {
            if (!$p['key'] || $p['box'] === null) {
                continue;
            }
            $best = null;
            $bestArea = INF;
            foreach ($paths as $j => $q) {
                if ($q['key'] || $q['box'] === null) {
                    continue;
                }
                [$a, $b, $c2, $d2] = $q['box'];
                if ($a <= $p['box'][0] && $b <= $p['box'][1] && $c2 >= $p['box'][2] && $d2 >= $p['box'][3]
                    && self::surrounds($q['rings'], $p['rings'])) {
                    // Prefer shapes painted below the hole, then the tightest fit.
                    $area = ($c2 - $a) * ($d2 - $b) * ($j < $i ? 1 : 1e6);
                    if ($area < $bestArea) {
                        $bestArea = $area;
                        $best = $j;
                    }
                }
            }
            if ($best === null) {
                continue;
            }
            $dx = $p['tx'] - $paths[$best]['tx'];
            $dy = $p['ty'] - $paths[$best]['ty'];
            $n = 0;
            $paths[$best]['holes'] .= ' ' . preg_replace_callback(
                '/-?\d*\.?\d+(?:e-?\d+)?/i',
                static function (array $x) use (&$n, $dx, $dy): string {
                    $v = (float)$x[0] + ($n++ % 2 === 0 ? $dx : $dy);
                    return (string)round($v, 3);
                },
                trim($p['d'])
            );
        }

        $out = '';
        $pos = 0;
        foreach ($paths as $p) {
            $out .= substr($svg, $pos, $p['off'] - $pos);
            $pos = $p['off'] + strlen($p['tag']);
            if ($p['key']) {
                continue;
            }
            $tag = $p['tag'];
            if (($p['holes'] ?? '') !== '') {
                $d = rtrim($p['d']) . $p['holes'];
                $tag = preg_replace('/\bd="[^"]*"/', 'd="' . $d . '" fill-rule="evenodd"', $tag, 1);
            }
            $out .= $tag;
        }
        return $out . substr($svg, $pos);
    }

    /**
     * Subpaths of an absolute M/L/C path as point lists (anchors and control points).
     *
     * @return list<list<array{0:float,1:float}>>
     */
    public static function rings(string $d, float $tx = 0.0, float $ty = 0.0): array
    {
        $rings = [];
        foreach (preg_split('/(?=M)/', $d, -1, PREG_SPLIT_NO_EMPTY) as $sub) {
            preg_match_all('/-?\d*\.?\d+(?:e-?\d+)?/i', $sub, $nums);
            $ring = [];
            for ($i = 0; $i + 1 < count($nums[0]); $i += 2) {
                $ring[] = [(float)$nums[0][$i] + $tx, (float)$nums[0][$i + 1] + $ty];
            }
            if (count($ring) >= 3) {
                $rings[] = $ring;
            }
        }
        return $rings;
    }

    /** True when (nearly) every vertex of the hole lies inside the even-odd shape. */
    private static function surrounds(array $shape, array $hole): bool
    {
        $pts = $hole ? array_merge(...$hole) : [];
        if (!$pts || !$shape) {
            return false;
        }
        $step = max(1, intdiv(count($pts), 32));
        $in = $total = 0;
        for ($i = 0; $i < count($pts); $i += $step) {
            [$x, $y] = $pts[$i];
            $inside = false;
            foreach ($shape as $ring) {
                $n = count($ring);
                for ($a = 0, $b = $n - 1; $a < $n; $b = $a++) {
                    [$xa, $ya] = $ring[$a];
                    [$xb, $yb] = $ring[$b];
                    if ((($ya > $y) !== ($yb > $y)) && $x < ($xb - $xa) * ($y - $ya) / ($yb - $ya) + $xa) {
                        $inside = !$inside;
                    }
                }
            }
            $in += $inside ? 1 : 0;
            $total++;
        }
        return $in >= $total * 0.9;
    }

    private static function exifRotate(\GdImage $img, string $src): \GdImage
    {
        if (!function_exists('exif_read_data')) {
            return $img;
        }
        $exif = @exif_read_data($src);
        $rotate = [3 => 180, 6 => -90, 8 => 90][(int)($exif['Orientation'] ?? 1)] ?? 0;
        if ($rotate !== 0) {
            $rotated = imagerotate($img, $rotate, 0);
            if ($rotated !== false) {
                return $rotated;
            }
        }
        return $img;
    }

    /** Downsampled opaque pixels (as [r,g,b]) and whether the image has transparency. */
    private static function sample(\GdImage $img): array
    {
        $w = imagesx($img);
        $h = imagesy($img);
        $step = max(1, (int)ceil(max($w, $h) / 220));
        $pixels = [];
        $alpha = false;
        for ($y = 0; $y < $h; $y += $step) {
            for ($x = 0; $x < $w; $x += $step) {
                $c = imagecolorat($img, $x, $y);
                $a = ($c >> 24) & 127;
                if ($a > 0) {
                    $alpha = true;
                }
                if ($a <= 63) {
                    $pixels[] = [($c >> 16) & 255, ($c >> 8) & 255, $c & 255];
                }
            }
        }
        return ['pixels' => $pixels, 'alpha' => $alpha];
    }

    /**
     * Dominant colours. $want = 0 picks the count automatically (colours that
     * cover at least 0.4 % of the image and are clearly distinct), otherwise
     * up to $want colours. Refined with two k-means passes.
     *
     * @param list<array{int,int,int}> $pixels
     * @return list<array{int,int,int}>
     */
    private static function palette(array $pixels, int $want): array
    {
        if ($pixels === []) {
            return [[0, 0, 0]];
        }
        // 16 levels per channel; each bin is scored with its neighbours so a colour
        // smeared over several bins by JPEG noise still counts as one colour.
        $bins = [];
        foreach ($pixels as [$r, $g, $b]) {
            $k = (($r >> 4) << 8) | (($g >> 4) << 4) | ($b >> 4);
            $bins[$k] = ($bins[$k] ?? 0) + 1;
        }
        $hist = [];
        foreach ($bins as $k => $cnt) {
            $r = $k >> 8;
            $g = ($k >> 4) & 15;
            $b = $k & 15;
            $score = 0;
            for ($dr = -1; $dr <= 1; $dr++) {
                for ($dg = -1; $dg <= 1; $dg++) {
                    for ($db = -1; $db <= 1; $db++) {
                        $score += $bins[(($r + $dr) << 8) | (($g + $dg) << 4) | ($b + $db)] ?? 0;
                    }
                }
            }
            $hist[$k] = $score + $cnt; // own bin counts double, so peaks win ties
        }
        arsort($hist);
        $n = count($pixels);
        $limit = $want > 0 ? $want : self::AUTO_MAX_COLORS;
        $minDist = $want > 0 ? max(100, (int)(2500 / max(1, $want / 4))) : 2500;
        $pal = [];
        foreach ($hist as $k => $cnt) {
            if ($want === 0 && $cnt / $n < 0.008) {
                break;
            }
            $c = [(($k >> 8) << 4) + 8, ((($k >> 4) & 15) << 4) + 8, (($k & 15) << 4) + 8];
            foreach ($pal as $p) {
                if (self::dist($c, $p) < $minDist) {
                    continue 2;
                }
            }
            // A mix of two chosen colours is an anti-aliased edge, not a new colour.
            if ($want === 0 && self::isBlend($c, $pal, $minDist)) {
                continue;
            }
            $pal[] = $c;
            if (count($pal) >= $limit) {
                break;
            }
        }
        if ($pal === []) {
            $pal[] = [(int)$pixels[0][0], (int)$pixels[0][1], (int)$pixels[0][2]];
        }
        for ($iter = 0; $iter < 2; $iter++) {
            $sum = array_fill(0, count($pal), [0, 0, 0, 0]);
            foreach ($pixels as $px) {
                $best = 0;
                $bd = PHP_INT_MAX;
                foreach ($pal as $i => $p) {
                    $d = self::dist($px, $p);
                    if ($d < $bd) {
                        $bd = $d;
                        $best = $i;
                    }
                }
                $sum[$best][0] += $px[0];
                $sum[$best][1] += $px[1];
                $sum[$best][2] += $px[2];
                $sum[$best][3]++;
            }
            foreach ($sum as $i => [$r, $g, $b, $c]) {
                if ($c > 0) {
                    $pal[$i] = [(int)round($r / $c), (int)round($g / $c), (int)round($b / $c)];
                }
            }
        }
        return $pal;
    }

    /** True when $c lies close to the straight line between two palette colours. */
    private static function isBlend(array $c, array $pal, int $minDist): bool
    {
        $n = count($pal);
        for ($i = 0; $i < $n; $i++) {
            for ($j = $i + 1; $j < $n; $j++) {
                $a = $pal[$i];
                $b = $pal[$j];
                $ab = [$b[0] - $a[0], $b[1] - $a[1], $b[2] - $a[2]];
                $len2 = $ab[0] ** 2 + $ab[1] ** 2 + $ab[2] ** 2;
                if ($len2 === 0) {
                    continue;
                }
                $t = (($c[0] - $a[0]) * $ab[0] + ($c[1] - $a[1]) * $ab[1] + ($c[2] - $a[2]) * $ab[2]) / $len2;
                if ($t <= 0.05 || $t >= 0.95) {
                    continue;
                }
                $p = [$a[0] + $ab[0] * $t, $a[1] + $ab[1] * $t, $a[2] + $ab[2] * $t];
                if (($c[0] - $p[0]) ** 2 + ($c[1] - $p[1]) ** 2 + ($c[2] - $p[2]) ** 2 < $minDist * 0.6) {
                    return true;
                }
            }
        }
        return false;
    }

    /** A colour far from every palette entry. */
    private static function pickKey(array $palette): array
    {
        $best = self::KEY_CANDIDATES[0];
        $bestD = -1;
        foreach (self::KEY_CANDIDATES as $c) {
            $d = PHP_INT_MAX;
            foreach ($palette as $p) {
                $d = min($d, self::dist($c, $p));
            }
            if ($d > $bestD) {
                $bestD = $d;
                $best = $c;
            }
        }
        return $best;
    }

    /** Flood-fill the dominant border colour (if it really is a background) with the key. */
    /** Replace the border background colour with the key: connected areas only, or everywhere. */
    private static function keyBackground(\GdImage $pal, int $keyIdx, bool $everywhere = false): void
    {
        $w = imagesx($pal);
        $h = imagesy($pal);
        $border = [];
        $step = max(1, (int)(($w + $h) / 400));
        $points = [];
        for ($x = 0; $x < $w; $x += $step) {
            $points[] = [$x, 0];
            $points[] = [$x, $h - 1];
        }
        for ($y = 0; $y < $h; $y += $step) {
            $points[] = [0, $y];
            $points[] = [$w - 1, $y];
        }
        foreach ($points as [$x, $y]) {
            $i = imagecolorat($pal, $x, $y);
            $border[$i] = ($border[$i] ?? 0) + 1;
        }
        arsort($border);
        $bgIdx = (int)array_key_first($border);
        if ($bgIdx === $keyIdx || $border[$bgIdx] / count($points) < 0.5) {
            return;
        }
        if ($everywhere) {
            $k = imagecolorsforindex($pal, $keyIdx);
            imagecolorset($pal, $bgIdx, $k['red'], $k['green'], $k['blue']);
            return;
        }
        $bg = imagecolorsforindex($pal, $bgIdx);
        foreach ($points as [$x, $y]) {
            $c = imagecolorsforindex($pal, imagecolorat($pal, $x, $y));
            if ($c['red'] === $bg['red'] && $c['green'] === $bg['green'] && $c['blue'] === $bg['blue']) {
                imagefill($pal, $x, $y, $keyIdx);
            }
        }
    }

    private static function dist(array $a, array $b): int
    {
        return ($a[0] - $b[0]) ** 2 + ($a[1] - $b[1]) ** 2 + ($a[2] - $b[2]) ** 2;
    }
}
