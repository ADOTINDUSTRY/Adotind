<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — front controller. Routed to by Adotind/.htaccess:
 *   RewriteRule ^svg-trace(/.*)?$ svg-trace/public/index.php [QSA,L]
 */

require_once dirname(__DIR__) . '/app/lib/config.php';
require_once dirname(__DIR__) . '/app/lib/db.php';
require_once dirname(__DIR__) . '/app/lib/security.php';
require_once dirname(__DIR__) . '/app/lib/storage.php';
require_once dirname(__DIR__) . '/app/lib/mailer.php';
require_once dirname(__DIR__) . '/app/lib/auth.php';
require_once dirname(__DIR__) . '/app/lib/jobs.php';

$config = StConfig::load();

// If configuration or the database is unavailable, public pages still render
// and account features show a clear "setup in progress" message instead of a 500.
$dbReady = false;
$maintenanceOn = false;
try {
    StDb::pdo($config);
    $dbReady = true;
    $maintenance = StDb::one("SELECT value_json FROM st_system_settings WHERE `key` = 'maintenance'");
    $maintenanceOn = $maintenance !== null
        && (bool)(json_decode((string)$maintenance['value_json'], true)['enabled'] ?? false);
} catch (Throwable $e) {
    error_log('[svg-trace] startup: ' . $e->getMessage());
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
// Normalise: strip the /svg-trace prefix so routes are deployment-agnostic.
$base = '/svg-trace';
if (str_starts_with($path, $base)) {
    $path = substr($path, strlen($base)) ?: '/';
}
$path = rtrim($path, '/') ?: '/';

$user = $dbReady ? StAuth::user() : null;

$publicPaths = ['/', '/privacy', '/terms'];
if (!$dbReady && !in_array($path, $publicPaths, true)) {
    http_response_code(503);
    $page = ['title' => 'Coming soon — A Dot SVG Trace', 'view' => 'unavailable'];
    require dirname(__DIR__) . '/app/views/layout.php';
    exit;
}

if ($maintenanceOn && $user === null && $path !== '/login') {
    http_response_code(503);
    echo '<!DOCTYPE html><title>Maintenance</title><h1>We will be right back.</h1><p>A Dot SVG Trace is undergoing scheduled maintenance.</p>';
    exit;
}

$route = static function (string $view, string $title, array $data = [], int $status = 200) use ($user, $config): never {
    http_response_code($status);
    $page = ['title' => $title, 'view' => $view] + $data;
    extract(['page' => $page, 'user' => $user, 'config' => $config], EXTR_SKIP);
    require dirname(__DIR__) . '/app/views/layout.php';
    exit;
};

$json = static function (array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
};
$apiUser = static function () use ($user, $json): array {
    if ($user === null) {
        $json(['error' => 'Please sign in again.'], 401);
    }
    return $user;
};

switch (true) {
    case $path === '/':
        $route('landing', 'A Dot SVG Trace — Turn Any Image Into a Clean, Editable Vector');
        // no break (never returns)

    case $path === '/login':
        if ($user !== null) {
            header('Location: ' . StAuth::baseUrl($config) . '/trace', true, 303);
            exit;
        }
        $route('login', 'Sign in — A Dot SVG Trace', [
            'google_enabled' => $config->has('GOOGLE_CLIENT_ID'),
            'facebook_enabled' => $config->has('FACEBOOK_APP_ID'),
        ]);

    case $path === '/auth/email' && $_SERVER['REQUEST_METHOD'] === 'POST':
        if (!StSecurity::csrfValidate($_POST['csrf_token'] ?? null)) {
            $route('login', 'Sign in — A Dot SVG Trace', ['error' => 'Your session expired. Please try again.'], 400);
        }
        $email = strtolower(trim((string)($_POST['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
            $route('login', 'Sign in — A Dot SVG Trace', ['error' => 'Please enter a valid email address.'], 422);
        }
        // Prevent account enumeration: identical response whether or not the
        // account exists. Rate limit by IP + email.
        if (!StAuth::rateLimit('magic_link_requested', $email, 5, 600)) {
            $route('login', 'Sign in — A Dot SVG Trace', ['error' => 'Too many sign-in links requested. Please wait 10 minutes, then use the newest email you received.'], 429);
        }
        StAuth::securityEvent('magic_link_requested', $email);
        $token = StAuth::magicLinkCreate($email);
        $link = StAuth::baseUrl($config) . '/auth/email/verify?email='
            . urlencode($email) . '&token=' . urlencode($token);
        $mailed = StMailer::send(
            $config,
            $email,
            'Your sign-in link for A Dot SVG Trace',
            "Hello,\n\nClick this link to sign in (valid for 15 minutes):\n\n{$link}\n\n"
            . "If you did not request this, you can ignore this email.\n\nA Dot Industry Enterprises Ltd"
        );
        if (!$mailed) {
            $route('login', 'Sign in — A Dot SVG Trace', ['error' => 'We could not send the email right now. Please try again in a few minutes.'], 503);
        }
        $route('login', 'Sign in — A Dot SVG Trace', ['sent' => $email]);

    case $path === '/auth/email/verify':
        $email = (string)($_GET['email'] ?? '');
        $token = (string)($_GET['token'] ?? '');
        $userRow = $token !== '' ? StAuth::magicLinkConsume($email, $token) : null;
        if ($userRow === null) {
            StAuth::securityEvent('magic_link_rejected', $email);
            $route('login', 'Sign in — A Dot SVG Trace', ['error' => 'That sign-in link is invalid or has expired. Request a new one.'], 403);
        }
        if (($userRow['status'] ?? '') !== 'active') {
            $route('login', 'Sign in — A Dot SVG Trace', ['error' => 'This account is not active.'], 403);
        }
        StAuth::loginUser((int)$userRow['id']);
        header('Location: ' . StAuth::baseUrl($config) . '/trace', true, 303);
        exit;

    case $path === '/auth/google' || $path === '/auth/facebook':
        $provider = substr($path, 6);
        $url = StAuth::oauthStartUrl($config, $provider);
        if ($url === null) {
            $route('login', 'Sign in — A Dot SVG Trace', ['error' => ucfirst($provider) . ' sign-in is not configured yet. Please use email.'], 503);
        }
        header('Location: ' . $url, true, 303);
        exit;

    case $path === '/auth/google/callback' || $path === '/auth/facebook/callback':
        $provider = substr($path, 6, -9);
        $userRow = StAuth::oauthCallback($config, $provider, $_GET);
        if ($userRow === null) {
            $route('login', 'Sign in — A Dot SVG Trace', ['error' => 'Sign-in with ' . ucfirst($provider) . ' failed. Please try again or use email.'], 403);
        }
        if (($userRow['status'] ?? '') !== 'active') {
            $route('login', 'Sign in — A Dot SVG Trace', ['error' => 'This account is not active.'], 403);
        }
        StAuth::loginUser((int)$userRow['id']);
        header('Location: ' . StAuth::baseUrl($config) . '/trace', true, 303);
        exit;

    case $path === '/logout' && $_SERVER['REQUEST_METHOD'] === 'POST':
        if (StSecurity::csrfValidate($_POST['csrf_token'] ?? null)) {
            StAuth::logout();
        }
        header('Location: ' . StAuth::baseUrl($config) . '/', true, 303);
        exit;

    case $path === '/account':
        $user = StAuth::requireUser();
        $route('account', 'My account — A Dot SVG Trace');

    case $path === '/trace':
        $user = StAuth::requireUser();
        $route('trace', 'Workspace — A Dot SVG Trace', [
            'presets' => StEngine::PRESETS,
            'upload' => ['max_bytes' => StJobs::maxUploadBytes()] + StSettings::get('upload'),
            'scripts' => ['trace.js'],
        ]);

    case $path === '/api/jobs' && $_SERVER['REQUEST_METHOD'] === 'POST':
        $u = $apiUser();
        if (!StSecurity::csrfValidate($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf_token'] ?? null))) {
            $json(['error' => 'Your session expired. Please reload the page.'], 400);
        }
        try {
            $hasUpload = isset($_FILES['image']) && (int)($_FILES['image']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
            if (!$hasUpload && empty($_POST['source_file_id']) && empty($_FILES)
                && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
                // PHP discards bodies larger than post_max_size.
                throw new StUserError('This file is too large.', 413);
            }
            $upload = $hasUpload ? StJobs::validateUpload($_FILES['image']) : null;
            $source = !$hasUpload && ctype_digit((string)($_POST['source_file_id'] ?? '')) ? (int)$_POST['source_file_id'] : null;
            $res = StJobs::enqueue((int)$u['id'], $upload, $source, $_POST);
            if (!$res['duplicate']) {
                StAuth::event((int)$u['id'], 'conversion_started', ['job_id' => $res['job_id']]);
                StJobs::kickWorker($config);
            }
            $json(['job' => StJobs::publicJob($res['job_id'], (int)$u['id']), 'duplicate' => $res['duplicate']], 201);
        } catch (StUserError $e) {
            $json(['error' => $e->getMessage()], $e->httpStatus);
        } catch (Throwable $e) {
            error_log('[svg-trace] enqueue: ' . $e->getMessage());
            $json(['error' => 'Something went wrong. Please try again.'], 500);
        }

    case preg_match('#^/api/jobs/(\d{1,19})$#', $path, $m) === 1:
        $u = $apiUser();
        $job = StJobs::publicJob((int)$m[1], (int)$u['id']);
        if ($job === null) {
            $json(['error' => 'Not found.'], 404);
        }
        if ($job['status'] === 'queued') {
            StJobs::kickWorker($config); // no-op when a worker is already running
        }
        $json(['job' => $job]);

    case preg_match('#^/files/(\d{1,19})/(view|download)$#', $path, $m) === 1:
        $u = StAuth::requireUser();
        $file = StDb::one(
            'SELECT * FROM st_files WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
            [(int)$m[1], (int)$u['id']]
        );
        if ($file === null) {
            $route('404', 'Not found — A Dot SVG Trace', [], 404);
        }
        $kindDir = ['original' => 'originals', 'output' => 'outputs', 'preview' => 'previews', 'export' => 'outputs'][$file['kind']];
        $mimes = ['svg' => 'image/svg+xml', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'bmp' => 'image/bmp',
                  'webp' => 'image/webp', 'pdf' => 'application/pdf', 'dxf' => 'application/dxf'];
        // Even sanitised SVG is rendered in a locked-down sandbox.
        header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
        StStorage::stream($kindDir, (string)$file['stored_name'], (string)$file['original_name'],
            $mimes[$file['format']] ?? 'application/octet-stream', $m[2] === 'view');

    case $path === '/privacy':
        $route('privacy', 'Privacy Policy — A Dot SVG Trace');

    case $path === '/terms':
        $route('terms', 'Terms of Service — A Dot SVG Trace');

    default:
        $route('404', 'Not found — A Dot SVG Trace', [], 404);
}
