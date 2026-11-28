<?php
declare(strict_types=1);

const QUOTE_TRACE_URL = '/online-quote/svg-trace';
const QUOTE_TRACE_MAX_BYTES = 8 * 1024 * 1024;
const QUOTE_TRACE_MAX_SIDE = 4096;

function quote_svg_trace_root(): string
{
    return is_dir('/opt/adot-svg-trace') ? '/opt/adot-svg-trace' : dirname(__DIR__, 2) . '/svg-trace';
}

function quote_svg_trace_json(int $status, array $data): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function quote_svg_trace_dispatch(string $path): never
{
    header('Cache-Control: private, no-store');
    header('X-Robots-Tag: noindex, nofollow');
    header('X-Content-Type-Options: nosniff');
    $convert = $path === QUOTE_TRACE_URL . '/convert';
    $ai = $path === QUOTE_TRACE_URL . '/ai';
    if (!online_quote_unlocked()) {
        if ($convert || $ai) quote_svg_trace_json(403, ['error'=>'Open Online Quote and enter the testing PIN to trace your logo.']);
        redirect('/online-quote?project=svgtrace', 303);
    }
    if (!isset(quote_project_catalog()['svgtrace'])) quote_svg_trace_json(404, ['error'=>'SVG Trace is unavailable.']);
    $root = quote_svg_trace_root();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($convert || $ai) {
        if ($method !== 'POST') {
            header('Allow: POST');
            quote_svg_trace_json(405, ['error'=>'Use a logo upload to trace.']);
        }
        if (!csrf_valid($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) quote_svg_trace_json(403, ['error'=>'Reload the editor and try again.']);
        if ($ai) {
            require_once __DIR__ . '/svg_trace_ai.php';
            svg_trace_ai_handle();
        }
        session_write_close();
        require_once $root . '/app/lib/conversion.php';
        quote_svg_trace_upload();
    }
    if (!in_array($method, ['GET', 'HEAD'], true)) {
        header('Allow: GET, HEAD');
        quote_svg_trace_json(405, ['error'=>'Open the editor to continue.']);
    }
    $assets = ['app.css'=>'text/css', 'trace.js'=>'application/javascript', 'editor.js'=>'application/javascript', 'ai.js'=>'application/javascript',
        'refine-geometry.js'=>'application/javascript', 'point-review.js'=>'application/javascript', 'tab-draft.js'=>'application/javascript'];
    foreach ($assets as $name => $type) {
        if ($path === QUOTE_TRACE_URL . '/assets/' . $name) {
            session_write_close();
            header('Content-Type: ' . $type . '; charset=utf-8');
            if ($method === 'GET') readfile($root . '/public/assets/' . $name);
            exit;
        }
    }
    if (rtrim($path, '/') !== QUOTE_TRACE_URL) quote_svg_trace_json(404, ['error'=>'Page unavailable.']);
    require_once $root . '/app/lib/security.php';
    require_once $root . '/app/lib/engine.php';
    $page = ['private_trace'=>true, 'presets'=>StEngine::PRESETS, 'upload'=>[
        'max_bytes'=>QUOTE_TRACE_MAX_BYTES, 'max_dimension_px'=>QUOTE_TRACE_MAX_SIDE,
        'formats'=>[['PNG',['png'],true], ['JPEG',['jpg','jpeg'],true], ['WebP',['webp'],true]],
    ]];
    $csrf = csrf_token();
    session_write_close();
    require __DIR__ . '/../views/pages/svg-trace.php';
    exit;
}

function quote_svg_trace_upload(): never
{
    $file = $_FILES['image'] ?? [];
    if (($file['error'] ?? null) === UPLOAD_ERR_INI_SIZE || ($file['size'] ?? 0) > QUOTE_TRACE_MAX_BYTES) {
        quote_svg_trace_json(413, ['error'=>'Choose a logo up to 8 MB.']);
    }
    if (($file['error'] ?? null) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
        quote_svg_trace_json(422, ['error'=>'Choose a PNG, JPEG or WebP logo.']);
    }
    $source = $file['tmp_name'];
    $size = @getimagesize($source);
    if (!$size || !in_array($size[2], [IMAGETYPE_PNG, IMAGETYPE_JPEG, IMAGETYPE_WEBP], true)) {
        quote_svg_trace_json(422, ['error'=>'The uploaded image must be a valid PNG, JPEG or WebP.']);
    }
    if (max($size[0], $size[1]) > QUOTE_TRACE_MAX_SIDE) {
        quote_svg_trace_json(422, ['error'=>'Resize the longest edge of your logo to 4,096 pixels or less.']);
    }
    $lock = fopen(sys_get_temp_dir() . '/adot-quote-svg-trace.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        header('Retry-After: 5');
        quote_svg_trace_json(503, ['error'=>'Another logo is being traced. Press Convert again in a moment.']);
    }
    $dir = sys_get_temp_dir() . '/adot-trace-' . bin2hex(random_bytes(16));
    if (!mkdir($dir, 0700)) quote_svg_trace_json(503, ['error'=>'The tracer could not start. Please try again.']);
    $png = $dir . '/prepared.png';
    $svg = $dir . '/trace.svg';
    register_shutdown_function(static function () use ($dir, $png, $svg) {
        foreach ([$png, $svg] as $file) if (is_file($file)) unlink($file);
        rmdir($dir);
    });
    try {
        $started = hrtime(true);
        $settings = StEngine::normaliseSettings($_POST);
        $prep = StPrep::prepare($source, $png, $settings);
        if (!$prep) quote_svg_trace_json(422, ['error'=>'Could not read the artwork. Try exporting it as PNG.']);
        $result = StConversion::tracePrepared($png, $svg, $prep, $settings, 35, 768, StConfig::load());
        if (!$result['ok']) {
            error_log('SVG trace engine: ' . substr($result['log'], 0, 400));
            quote_svg_trace_json(422, ['error'=>'Could not trace this logo with those settings. Try fewer colours or a smaller image.']);
        }
        if (filesize($svg) > 8 * 1024 * 1024) quote_svg_trace_json(422, ['error'=>'This result is too large to edit. Choose fewer colours or increase Remove specks.']);
        $art = StConversion::readSvg($svg, $prep, $settings);
        if (!$art || !str_contains($art, '<path')) quote_svg_trace_json(422, ['error'=>'No curves were found. Adjust the background or threshold and convert again.']);
        quote_svg_trace_json(200, ['svg'=>$art, 'width'=>$prep['source_width'], 'height'=>$prep['source_height'], 'duration_ms'=>(int)((hrtime(true) - $started) / 1e6)]);
    } catch (Throwable $error) {
        error_log('SVG trace failed: ' . $error->getMessage());
        quote_svg_trace_json(500, ['error'=>'The tracer could not finish. Please retry with a smaller logo.']);
    }
}
