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

function icon_svg(string $name): string
{
    $icons = [
        'factory' => '<path d="M2 21h20M4 21V9l5 3.2V9l5 3.2V4h6v17"/><path d="M17 8h2M17 12h2M17 16h2"/>',
        'sign' => '<path d="M4 7V4h16v3M9 21h6M12 4v17"/>',
        'cnc' => '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
        'laser' => '<path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z"/>',
        'print' => '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/>',
        'fab' => '<path d="M14.7 6.3a4.2 4.2 0 0 0-5.6 5.6L3 18v3h3l6.1-6.1a4.2 4.2 0 0 0 5.6-5.6l-2.9 2.9-2.1-2.1 2-2.8z"/>',
    ];
    $path = $icons[$name] ?? $icons['factory'];
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $path . '</svg>';
}

function placeholder_html(string $icon, string $label, string $sub = ''): string
{
    $html = '<div class="photo-placeholder photo-placeholder-icon" role="img" aria-label="' . e($label) . '">'
        . '<span class="ph-icon">' . icon_svg($icon) . '</span>'
        . '<p>' . e($label) . '</p>';
    if ($sub !== '') {
        $html .= '<small>' . e($sub) . '</small>';
    }
    return $html . '</div>';
}

function placeholder_icon_for_category(string $category): string
{
    return match ($category) {
        'signage' => 'sign',
        'illuminated-signs' => 'laser',
        'cnc' => 'cnc',
        'laser-cutting' => 'laser',
        'printing' => 'print',
        'fabrication' => 'fab',
        default => 'factory',
    };
}
