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

switch (true) {
    case $path === '/':
        $route('landing', 'A Dot SVG Trace — Turn Any Image Into a Clean, Editable Vector');
        // no break (never returns)

    case $path === '/login':
        if ($user !== null) {
            header('Location: ' . StAuth::baseUrl($config) . '/account', true, 303);
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
        if (StAuth::rateLimit('magic_link_requested', $email, 5, 600)) {
            StAuth::securityEvent('magic_link_requested', $email);
            $token = StAuth::magicLinkCreate($email);
            $link = StAuth::baseUrl($config) . '/auth/email/verify?email='
                . urlencode($email) . '&token=' . urlencode($token);
            StMailer::send(
                $config,
                $email,
                'Your sign-in link for A Dot SVG Trace',
                "Hello,\n\nClick this link to sign in (valid for 15 minutes):\n\n{$link}\n\n"
                . "If you did not request this, you can ignore this email.\n\nA Dot Industry Enterprises Ltd"
            );
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
        header('Location: ' . StAuth::baseUrl($config) . '/account', true, 303);
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
        header('Location: ' . StAuth::baseUrl($config) . '/account', true, 303);
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

    case $path === '/privacy':
        $route('privacy', 'Privacy Policy — A Dot SVG Trace');

    case $path === '/terms':
        $route('terms', 'Terms of Service — A Dot SVG Trace');

    default:
        $route('404', 'Not found — A Dot SVG Trace', [], 404);
}
