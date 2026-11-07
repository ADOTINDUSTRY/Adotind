<?php
declare(strict_types=1);

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function canonical_url(array $siteConfig): string
{
    $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $path = rtrim($uriPath, '/');
    if ($path === '') {
        $path = '/';
    }

    return rtrim($siteConfig['base_url'], '/') . $path;
}

function current_path(): string
{
    return parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
}

function starts_with(string $value, string $prefix): bool
{
    return strncmp($value, $prefix, strlen($prefix)) === 0;
}

function csrf_token(): string
{
    if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrf_valid(?string $token): bool
{
    if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token']) || $token === null) {
        return false;
    }
    return hash_equals($_SESSION['csrf_token'], $token);
}

function flash_set(string $key, mixed $value): void
{
    $_SESSION['flash'][$key] = $value;
}

function flash_get(string $key, mixed $default = null): mixed
{
    if (!isset($_SESSION['flash'][$key])) {
        return $default;
    }
    $value = $_SESSION['flash'][$key];
    unset($_SESSION['flash'][$key]);
    return $value;
}

function redirect(string $url, int $status = 302): never
{
    header('Location: ' . $url, true, $status);
    exit;
}

function render_layout(array $siteConfig, array $page): void
{
    $viewFile = __DIR__ . '/../views/pages/' . $page['view'] . '.php';
    if (!is_file($viewFile)) {
        http_response_code(500);
        echo 'View not found.';
        return;
    }

    require __DIR__ . '/../views/layout.php';
}
