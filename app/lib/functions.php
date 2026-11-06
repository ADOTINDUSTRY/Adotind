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
