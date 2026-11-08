<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — upload import.
 *
 * Detects the real file type from its bytes (never the name), then turns any
 * supported format into a PNG/JPG the tracer can read. Very large images are
 * scaled down to STORE_SIDE (tracing works at ~2000 px, so no detail is lost)
 * and vector files (PDF, AI, EPS, SVG) are rendered at VECTOR_SIDE.
 *
 * GD formats always work. Everything else needs the Imagick extension; vector
 * formats additionally need Ghostscript (PDF/AI/EPS) or an SVG renderer, which
 * is checked once by decoding a tiny sample and cached.
 */

final class StImport
{
    public const STORE_SIDE = 6000;
    public const VECTOR_SIDE = 4000;
    public const MAX_INPUT_PIXELS = 300_000_000;
    private const GD_MAX_PIXELS = 64_000_000;

    /** id => [label, extensions, decoder, Imagick coder, vector, browser can preview] */
    private const FORMATS = [
        'jpg' => ['JPG', ['jpg', 'jpeg', 'jfif', 'jpe'], 'gd', 'JPEG', false, true],
        'png' => ['PNG', ['png'], 'gd', 'PNG', false, true],
        'pdf' => ['PDF', ['pdf'], 'imagick', 'PDF', true, false],
        'ai' => ['AI', ['ai'], 'imagick', 'PDF', true, false],
        'eps' => ['EPS', ['eps', 'ps', 'epsf'], 'imagick', 'EPS', true, false],
        'svg' => ['SVG', ['svg'], 'imagick', 'SVG', true, true],
        'webp' => ['WEBP', ['webp'], 'gd', 'WEBP', false, true],
        'gif' => ['GIF', ['gif'], 'gd', 'GIF', false, true],
        'bmp' => ['BMP', ['bmp', 'dib'], 'gd', 'BMP', false, true],
        'tiff' => ['TIFF', ['tif', 'tiff'], 'imagick', 'TIFF', false, false],
        'psd' => ['PSD', ['psd', 'psb'], 'imagick', 'PSD', false, false],
        'heic' => ['HEIC', ['heic', 'heif'], 'imagick', 'HEIC', false, false],
        'avif' => ['AVIF', ['avif'], 'imagick', 'AVIF', false, true],
        'jp2' => ['JPEG 2000', ['jp2', 'j2k', 'jpf', 'jpx'], 'imagick', 'JP2', false, false],
        'ico' => ['ICO', ['ico'], 'imagick', 'ICO', false, true],
    ];
    /** GD-readable formats the worker can use directly (no conversion). */
    private const KEEP = ['png', 'jpg', 'bmp', 'webp'];

    /** @var array<string,bool>|null */
    private static ?array $available = null;
    /** @var list<string> */
    private static array $temp = [];

    /**
     * Formats this server can open: id => [label, extensions, browser preview].
     *
     * @return array<string, array{0:string, 1:list<string>, 2:bool}>
     */
    public static function supported(): array
    {
        $out = [];
        foreach (self::FORMATS as $id => $f) {
            if (self::can($id)) {
                $out[$id] = [$f[0], $f[1], $f[5]];
            }
        }
        return $out;
    }

    public static function can(string $id): bool
    {
        if (self::$available === null) {
            self::$available = self::detectAvailable();
        }
        return self::$available[$id] ?? false;
    }

    /** Short human list, e.g. "JPG, PNG, PDF, …". */
    public static function labelList(): string
    {
        return implode(', ', array_map(static fn(array $f): string => $f[0], self::supported()));
    }

    /**
     * Identify the format from magic bytes.
     */
    public static function detect(string $path, string $name = ''): ?string
    {
        $fh = @fopen($path, 'rb');
        if ($fh === false) {
            return null;
        }
        $head = (string)fread($fh, 1024);
        fclose($fh);
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $b = static fn(int $off, string $sig): bool => substr($head, $off, strlen($sig)) === $sig;

        if ($b(0, "\x89PNG\r\n\x1a\n")) {
            return 'png';
        }
        if ($b(0, "\xFF\xD8\xFF")) {
            return 'jpg';
        }
        if ($b(0, 'GIF87a') || $b(0, 'GIF89a')) {
            return 'gif';
        }
        if ($b(0, 'RIFF') && $b(8, 'WEBP')) {
            return 'webp';
        }
        if ($b(0, 'BM') && strlen($head) > 26) {
            return 'bmp';
        }
        if ($b(0, "II*\0") || $b(0, "MM\0*") || $b(0, "II+\0") || $b(0, "MM\0+")) {
            return 'tiff';
        }
        if ($b(0, '8BPS')) {
            return 'psd';
        }
        if ($b(4, 'ftyp')) {
            $brand = substr($head, 8, 4);
            if (in_array($brand, ['avif', 'avis'], true)) {
                return 'avif';
            }
            if (in_array($brand, ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'], true)) {
                // mif1 is used by both; the compatible brands say which.
                return str_contains(substr($head, 8, 64), 'avif') ? 'avif' : 'heic';
            }
            return null;
        }
        if ($b(0, "\0\0\0\x0CjP  \r\n\x87\n") || $b(0, "\xFF\x4F\xFF\x51")) {
            return 'jp2';
        }
        if ($b(0, "\0\0\1\0") && ($ext === 'ico' || ord($head[4] ?? "\0") > 0)) {
            return 'ico';
        }
        $pdfAt = strpos(substr($head, 0, 1024), '%PDF-');
        if ($pdfAt !== false) {
            return $ext === 'ai' ? 'ai' : 'pdf';
        }
        if ($b(0, '%!PS') || $b(0, "\xC5\xD0\xD3\xC6")) {
            return 'eps';
        }
        $text = ltrim(preg_replace('/^\xEF\xBB\xBF/', '', $head) ?? '');
        if (preg_match('/^(<\?xml[^>]*>\s*)?(<!--.*?-->\s*)*<svg[\s>]/is', $text) === 1
            || (str_starts_with($text, '<') && stripos($head, '<svg') !== false && in_array($ext, ['svg', ''], true))) {
            return 'svg';
        }
        return null;
    }

    /**
     * Turn an uploaded file into something the tracer reads.
     *
     * @return array{path:string, ext:string, width:int, height:int, name:string, converted:bool}
     */
    public static function normalise(string $path, string $name, int $maxSide): array
    {
        $fmt = self::detect($path, $name);
        if ($fmt === null || !isset(self::FORMATS[$fmt])) {
            throw new StUserError('This file type is not supported. You can upload: ' . self::labelList() . '.', 415);
        }
        if (!self::can($fmt)) {
            throw new StUserError(self::FORMATS[$fmt][0] . ' files cannot be opened on this server yet. Please save it as PNG or JPG. Supported: '
                . self::labelList() . '.', 415);
        }
        @set_time_limit(300);
        $base = pathinfo($name, PATHINFO_FILENAME) ?: 'image';
        if (self::FORMATS[$fmt][4]) {
            $r = self::renderVector($path, $fmt);
            return $r + ['name' => $base . '.png', 'converted' => true];
        }

        // Raster: read dimensions from the header before decoding anything.
        [$w, $h, $cmyk] = self::rasterSize($path, $fmt);
        if ($w < 1 || $h < 1) {
            throw new StUserError('This image could not be read. It may be damaged.');
        }
        // Imagick decodes JPEG at reduced size (jpeg:size), so only the side limit applies there.
        $areaOk = $w * $h <= self::MAX_INPUT_PIXELS || ($fmt === 'jpg' && class_exists('Imagick'));
        if ($w > $maxSide || $h > $maxSide || !$areaOk) {
            $mp = round(self::MAX_INPUT_PIXELS / 1e6);
            throw new StUserError("This image is {$w}×{$h} px. The maximum is {$maxSide} px on each side and {$mp} megapixels.", 413);
        }
        $fits = $w <= self::STORE_SIDE && $h <= self::STORE_SIDE;
        if ($fits && in_array($fmt, self::KEEP, true) && !$cmyk) {
            return ['path' => $path, 'ext' => $fmt, 'width' => $w, 'height' => $h, 'name' => $name, 'converted' => false];
        }
        $r = class_exists('Imagick') ? self::convertImagick($path, $fmt, $w, $h) : self::convertGd($path, $fmt, $w, $h);
        return $r + ['name' => $base . '.' . $r['ext'], 'converted' => true];
    }

    // ------------------------------------------------------------------

    /** @return array{0:int,1:int,2:bool} width, height, is CMYK */
    private static function rasterSize(string $path, string $fmt): array
    {
        if (self::FORMATS[$fmt][2] === 'gd' || $fmt === 'avif') {
            $info = @getimagesize($path);
            if ($info !== false && $info[0] > 0) {
                return [(int)$info[0], (int)$info[1], ($info['channels'] ?? 3) === 4 && $fmt === 'jpg'];
            }
        }
        if (!class_exists('Imagick')) {
            return [0, 0, false];
        }
        try {
            self::limits();
            $im = new Imagick();
            $im->pingImage(self::coderPath($fmt, $path));
            $r = [$im->getImageWidth(), $im->getImageHeight(), $im->getImageColorspace() === Imagick::COLORSPACE_CMYK];
            $im->clear();
            return $r;
        } catch (Throwable $e) {
            return [0, 0, false];
        }
    }

    /** @return array{path:string, ext:string, width:int, height:int} */
    private static function convertImagick(string $path, string $fmt, int $w, int $h): array
    {
        try {
            self::limits();
            $im = new Imagick();
            [$tw, $th] = self::fit($w, $h, self::STORE_SIDE);
            if ($fmt === 'jpg') {
                $im->setOption('jpeg:size', $tw . 'x' . $th); // libjpeg decodes at reduced size: fast, low memory
            }
            $im->readImage(self::coderPath($fmt, $path));
            if ($fmt === 'ico') {
                $im = self::largestFrame($im);
            }
            self::orient($im);
            if ($im->getImageColorspace() === Imagick::COLORSPACE_CMYK) {
                $im->transformImageColorspace(Imagick::COLORSPACE_SRGB);
            }
            $im->setImageDepth(8);
            if ($im->getImageWidth() > self::STORE_SIDE || $im->getImageHeight() > self::STORE_SIDE) {
                [$tw, $th] = self::fit($im->getImageWidth(), $im->getImageHeight(), self::STORE_SIDE);
                $im->resizeImage($tw, $th, Imagick::FILTER_LANCZOS, 1);
            }
            return self::writeImagick($im);
        } catch (StUserError $e) {
            throw $e;
        } catch (Throwable $e) {
            error_log('[svg-trace] import ' . $fmt . ': ' . $e->getMessage());
            throw new StUserError('This ' . self::FORMATS[$fmt][0] . ' file could not be opened. It may be damaged or too complex. Please try saving it as PNG or JPG.');
        }
    }

    /** @return array{path:string, ext:string, width:int, height:int} */
    private static function convertGd(string $path, string $fmt, int $w, int $h): array
    {
        if ($w * $h > self::GD_MAX_PIXELS) {
            $mp = round(self::GD_MAX_PIXELS / 1e6);
            throw new StUserError("This image is too large for this server ({$w}×{$h} px). Please make it smaller than {$mp} megapixels.", 413);
        }
        @ini_set('memory_limit', '1536M');
        $img = @imagecreatefromstring((string)file_get_contents($path));
        if ($img === false) {
            throw new StUserError('This image could not be read. It may be damaged.');
        }
        if (!imageistruecolor($img)) {
            imagepalettetotruecolor($img);
        }
        if ($w > self::STORE_SIDE || $h > self::STORE_SIDE) {
            [$tw, $th] = self::fit($w, $h, self::STORE_SIDE);
            $small = imagescale($img, $tw, $th, IMG_BICUBIC);
            imagedestroy($img);
            if ($small === false) {
                throw new StUserError('This image could not be resized. Please make it smaller.');
            }
            $img = $small;
        }
        $out = self::tempFile();
        imagealphablending($img, false);
        imagesavealpha($img, true);
        $ext = $fmt === 'jpg' ? 'jpg' : 'png';
        $ok = $ext === 'jpg' ? imagejpeg($img, $out, 92) : imagepng($img, $out, 6);
        $r = ['path' => $out, 'ext' => $ext, 'width' => imagesx($img), 'height' => imagesy($img)];
        imagedestroy($img);
        if (!$ok) {
            throw new StUserError('The image could not be converted. Please try again.');
        }
        return $r;
    }

    /** @return array{path:string, ext:string, width:int, height:int} */
    private static function renderVector(string $path, string $fmt): array
    {
        $src = $path;
        if ($fmt === 'svg') {
            $clean = self::cleanSvg((string)file_get_contents($path));
            if ($clean === null) {
                throw new StUserError('This SVG file could not be read.');
            }
            $src = self::tempFile();
            file_put_contents($src, self::scaleSvg($clean, self::VECTOR_SIDE));
        }
        $baseDpi = $fmt === 'svg' ? 96.0 : 72.0;
        try {
            self::limits();
            $dpi = $baseDpi; // SVG is already sized by scaleSvg(); not all SVG renderers honour density
            if ($fmt !== 'svg') {
                // A quick low-resolution pass gives the page size, then render sharp.
                $probe = new Imagick();
                $probe->setResolution(24, 24);
                $probe->readImage(self::coderPath($fmt, $src));
                $pw = $probe->getImageWidth() * $baseDpi / 24;
                $ph = $probe->getImageHeight() * $baseDpi / 24;
                $probe->clear();
                $dpi = max(24.0, min(2400.0, $baseDpi * self::VECTOR_SIDE / max(1.0, $pw, $ph)));
            }
            $im = new Imagick();
            $im->setResolution($dpi, $dpi);
            $im->setBackgroundColor(new ImagickPixel('transparent'));
            $im->readImage(self::coderPath($fmt, $src));
            if ($im->getImageColorspace() === Imagick::COLORSPACE_CMYK) {
                $im->transformImageColorspace(Imagick::COLORSPACE_SRGB);
            }
            $im->setImageDepth(8);
            if ($im->getImageWidth() > self::STORE_SIDE || $im->getImageHeight() > self::STORE_SIDE) {
                [$tw, $th] = self::fit($im->getImageWidth(), $im->getImageHeight(), self::STORE_SIDE);
                $im->resizeImage($tw, $th, Imagick::FILTER_LANCZOS, 1);
            }
            return self::writeImagick($im);
        } catch (Throwable $e) {
            error_log('[svg-trace] import ' . $fmt . ': ' . $e->getMessage());
            throw new StUserError('This ' . self::FORMATS[$fmt][0] . ' file could not be opened. It may be damaged, password-protected or use unsupported features. Please export it as PNG.');
        }
    }

    /** @return array{path:string, ext:string, width:int, height:int} */
    private static function writeImagick(Imagick $im): array
    {
        $out = self::tempFile();
        $im->stripImage();
        $im->setOption('png:exclude-chunks', 'date,time'); // same input gives the same file (duplicate detection)
        $im->setImageFormat('png');
        $im->writeImage('png:' . $out);
        $r = ['path' => $out, 'ext' => 'png', 'width' => $im->getImageWidth(), 'height' => $im->getImageHeight()];
        $im->clear();
        return $r;
    }

    private static function largestFrame(Imagick $im): Imagick
    {
        $best = 0;
        $bestArea = -1;
        foreach ($im as $i => $frame) {
            $a = $frame->getImageWidth() * $frame->getImageHeight();
            if ($a > $bestArea) {
                $bestArea = $a;
                $best = $i;
            }
        }
        $im->setIteratorIndex($best);
        $one = $im->getImage();
        $im->clear();
        return $one;
    }

    private static function orient(Imagick $im): void
    {
        switch ($im->getImageOrientation()) {
            case Imagick::ORIENTATION_TOPRIGHT: $im->flopImage(); break;
            case Imagick::ORIENTATION_BOTTOMRIGHT: $im->rotateImage('none', 180); break;
            case Imagick::ORIENTATION_BOTTOMLEFT: $im->flipImage(); break;
            case Imagick::ORIENTATION_LEFTTOP: $im->transposeImage(); break;
            case Imagick::ORIENTATION_RIGHTTOP: $im->rotateImage('none', 90); break;
            case Imagick::ORIENTATION_RIGHTBOTTOM: $im->transverseImage(); break;
            case Imagick::ORIENTATION_LEFTBOTTOM: $im->rotateImage('none', -90); break;
            default: return;
        }
        $im->setImageOrientation(Imagick::ORIENTATION_TOPLEFT);
    }

    /** Force the decoder: ImageMagick must never guess the type of an untrusted file. */
    private static function coderPath(string $fmt, string $path): string
    {
        if (preg_match('#^[A-Za-z0-9_./\-]+$#', $path) !== 1) {
            throw new RuntimeException('unsafe temp path');
        }
        return self::FORMATS[$fmt][3] . ':' . $path . '[0]';
    }

    /** @return array{0:int,1:int} */
    private static function fit(int $w, int $h, int $side): array
    {
        $k = min(1.0, $side / max($w, $h));
        return [max(1, (int)round($w * $k)), max(1, (int)round($h * $k))];
    }

    private static function limits(): void
    {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;
        $set = static function (string $const, int $v): void {
            if (defined('Imagick::' . $const)) {
                Imagick::setResourceLimit(constant('Imagick::' . $const), $v);
            }
        };
        $set('RESOURCETYPE_AREA', self::MAX_INPUT_PIXELS);
        $set('RESOURCETYPE_MEMORY', 768 * 1048576);
        $set('RESOURCETYPE_MAP', 1536 * 1048576);
        $set('RESOURCETYPE_DISK', 6 * 1073741824);
        $set('RESOURCETYPE_TIME', 240);
    }

    private static function tempFile(): string
    {
        $f = tempnam(sys_get_temp_dir(), 'stimp');
        if ($f === false) {
            throw new RuntimeException('cannot create temp file');
        }
        if (!self::$temp) {
            register_shutdown_function(static function (): void {
                foreach (self::$temp as $t) {
                    if (is_file($t)) {
                        @unlink($t);
                    }
                }
            });
        }
        self::$temp[] = $f;
        return $f;
    }

    /**
     * Strict whitelist for SVG that will be rasterised by ImageMagick: shapes,
     * text, gradients and styles only; no images, external links or URLs.
     */
    public static function cleanSvg(string $svg): ?string
    {
        if (preg_match('/<!DOCTYPE|<!ENTITY/i', $svg) === 1) {
            return null;
        }
        $prev = libxml_use_internal_errors(true);
        $dom = new DOMDocument();
        $ok = $dom->loadXML($svg, LIBXML_NONET | LIBXML_PARSEHUGE);
        libxml_use_internal_errors($prev);
        $root = $dom->documentElement;
        if (!$ok || $root === null || strtolower($root->localName) !== 'svg') {
            return null;
        }
        $allowed = array_flip(['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
            'text', 'tspan', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'symbol',
            'use', 'style', 'title', 'desc', 'a', 'switch', 'marker']);
        $badUrl = static fn(string $v): bool => preg_match('/url\s*\(\s*[\'"]?\s*(?!#)/i', $v) === 1
            || stripos($v, '@import') !== false || stripos($v, 'expression') !== false;
        $remove = [];
        foreach ($dom->getElementsByTagName('*') as $el) {
            /** @var DOMElement $el */
            $tag = strtolower((string)$el->localName);
            if (!isset($allowed[$tag]) || ($tag === 'style' && $badUrl((string)$el->textContent))) {
                $remove[] = $el;
                continue;
            }
            $drop = [];
            foreach ($el->attributes as $attr) {
                $n = strtolower((string)$attr->localName);
                $v = (string)$attr->value;
                if (str_starts_with($n, 'on') || $badUrl($v)
                    || ($n === 'href' && !str_starts_with(trim($v), '#'))) {
                    $drop[] = $attr;
                }
            }
            foreach ($drop as $attr) {
                $el->removeAttributeNode($attr);
            }
        }
        foreach ($remove as $el) {
            $el->parentNode?->removeChild($el);
        }
        $out = $dom->saveXML($root);
        return is_string($out) ? $out : null;
    }

    /** Give the root <svg> a pixel size whose longest side is $side, keeping its proportions. */
    private static function scaleSvg(string $svg, int $side): string
    {
        $dom = new DOMDocument();
        if (!@$dom->loadXML($svg, LIBXML_NONET | LIBXML_PARSEHUGE) || $dom->documentElement === null) {
            return $svg;
        }
        $root = $dom->documentElement;
        $px = static function (string $v): ?float {
            if (preg_match('/^\s*([0-9.]+(?:e[-+]?\d+)?)\s*(px|pt|pc|mm|cm|in)?\s*$/i', $v, $m) !== 1) {
                return null; // missing or percentage
            }
            $k = ['px' => 1, 'pt' => 4 / 3, 'pc' => 16, 'mm' => 96 / 25.4, 'cm' => 96 / 2.54, 'in' => 96][strtolower($m[2] ?? 'px')];
            return (float)$m[1] * $k;
        };
        $w = $px($root->getAttribute('width'));
        $h = $px($root->getAttribute('height'));
        $vb = preg_split('/[\s,]+/', trim($root->getAttribute('viewBox')));
        $hasVb = count($vb) === 4 && (float)$vb[2] > 0 && (float)$vb[3] > 0;
        if ($hasVb) {
            $ratio = (float)$vb[3] / (float)$vb[2];
            if ($w === null && $h === null) {
                $w = (float)$vb[2];
            }
            $w ??= $h / $ratio;
            $h ??= $w * $ratio;
        } elseif ($w !== null && $h !== null && $w > 0 && $h > 0) {
            $root->setAttribute('viewBox', '0 0 ' . $w . ' ' . $h);
        } else {
            return $svg; // no usable size: render as-is
        }
        if ($w <= 0 || $h <= 0) {
            return $svg;
        }
        $k = $side / max($w, $h);
        $root->setAttribute('width', (string)max(1, round($w * $k)));
        $root->setAttribute('height', (string)max(1, round($h * $k)));
        $out = $dom->saveXML($root);
        return is_string($out) ? $out : $svg;
    }

    // ------------------------------------------------------------------

    /** @return array<string,bool> */
    private static function detectAvailable(): array
    {
        $gd = function_exists('imagetypes') ? imagetypes() : 0;
        $out = [
            'png' => (bool)($gd & IMG_PNG),
            'jpg' => (bool)($gd & IMG_JPG),
            'gif' => (bool)($gd & IMG_GIF),
            'webp' => (bool)($gd & IMG_WEBP),
            'bmp' => defined('IMG_BMP') && (bool)($gd & IMG_BMP),
        ];
        if (!class_exists('Imagick')) {
            return $out;
        }
        try {
            $coders = array_flip(Imagick::queryFormats());
        } catch (Throwable $e) {
            return $out;
        }
        foreach (self::FORMATS as $id => $f) {
            if (!isset($out[$id]) && !$f[4]) {
                $out[$id] = isset($coders[$f[3]]);
            }
        }
        // Vector formats depend on Ghostscript / SVG delegates and the security
        // policy, so try a tiny sample once and remember the answer for a day.
        $cache = self::cachePath();
        $known = $cache !== null && is_file($cache) && filemtime($cache) > time() - 86400
            ? json_decode((string)file_get_contents($cache), true) : null;
        if (!is_array($known)) {
            $known = [];
            foreach (['pdf' => self::SAMPLE_PDF, 'eps' => self::SAMPLE_EPS, 'svg' => self::SAMPLE_SVG] as $id => $sample) {
                // queryFormats() can omit delegate-backed coders, so a real decode is the only reliable test.
                $known[$id] = self::trySample($id, $sample);
            }
            if ($cache !== null) {
                @file_put_contents($cache, json_encode($known));
            }
        }
        $out['pdf'] = (bool)($known['pdf'] ?? false);
        $out['ai'] = $out['pdf'];
        $out['eps'] = (bool)($known['eps'] ?? false);
        $out['svg'] = (bool)($known['svg'] ?? false);
        return $out;
    }

    private static function trySample(string $fmt, string $data): bool
    {
        $f = tempnam(sys_get_temp_dir(), 'stfmt');
        if ($f === false) {
            return false;
        }
        try {
            file_put_contents($f, $data);
            $im = new Imagick();
            $im->setResolution(36, 36);
            $im->readImage(self::coderPath($fmt, $f));
            return $im->getImageWidth() > 0;
        } catch (Throwable $e) {
            return false;
        } finally {
            @unlink($f);
        }
    }

    private static function cachePath(): ?string
    {
        try {
            if (class_exists('StStorage')) {
                return StStorage::root() . '/formats.json';
            }
        } catch (Throwable $e) {
        }
        return null;
    }

    private const SAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="10" height="10" fill="#f00"/></svg>';
    private const SAMPLE_EPS = "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 20 20\nnewpath 2 2 moveto 18 18 lineto stroke\nshowpage\n%%EOF\n";
    private const SAMPLE_PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        . "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 20 20]/Contents 4 0 R/Resources<<>>>>endobj\n"
        . "4 0 obj<</Length 21>>stream\n0 0 10 10 re f\nendstream endobj\n"
        . "trailer<</Root 1 0 R/Size 5>>\n%%EOF\n";
}
