<?php
// Dev-only router for the PHP built-in server (Apache + .htaccess does this in
// production). Usage from repo root: php -S 127.0.0.1:8097 tools/dev-router.php
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$file = __DIR__ . '/..' . $path;
if ($path !== '/' && is_file($file)) {
    return false; // let the built-in server serve static files
}
if (str_starts_with($path, '/svg-trace/assets/')) {
    $asset = realpath(__DIR__ . '/../svg-trace/public/assets/' . substr($path, strlen('/svg-trace/assets/')));
    $allowed = realpath(__DIR__ . '/../svg-trace/public/assets');
    if ($asset !== false && $allowed !== false && str_starts_with($asset, $allowed) && is_file($asset)) {
        $mimes = ['css' => 'text/css', 'js' => 'application/javascript', 'png' => 'image/png', 'svg' => 'image/svg+xml', 'webp' => 'image/webp', 'jpg' => 'image/jpeg', 'woff2' => 'font/woff2'];
        $ext = strtolower(pathinfo($asset, PATHINFO_EXTENSION));
        header('Content-Type: ' . ($mimes[$ext] ?? 'application/octet-stream'));
        readfile($asset);
        return true;
    }
    http_response_code(404);
    return true;
}
if (str_starts_with($path, '/svg-trace')) {
    require __DIR__ . '/../svg-trace/public/index.php';
    return true;
}
require __DIR__ . '/../index.php';
return true;
