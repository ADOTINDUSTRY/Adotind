<?php
declare(strict_types=1);

require_once __DIR__ . '/app/config/site.php';
require_once __DIR__ . '/app/lib/functions.php';

$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = '/' . trim($uriPath, '/');
if ($path === '//') {
    $path = '/';
}

$routes = [
    '/' => ['view' => 'home', 'title' => 'A Dot Industry | Signage, CNC, Laser & Fabrication in Cyprus'],
    '/about' => ['view' => 'placeholder', 'title' => 'About | A Dot Industry', 'heading' => 'About A Dot Industry'],
    '/services' => ['view' => 'placeholder', 'title' => 'Services | A Dot Industry', 'heading' => 'Services'],
    '/portfolio' => ['view' => 'placeholder', 'title' => 'Portfolio | A Dot Industry', 'heading' => 'Portfolio'],
    '/machinery' => ['view' => 'placeholder', 'title' => 'Machinery | A Dot Industry', 'heading' => 'Machinery & Technology'],
    '/materials' => ['view' => 'placeholder', 'title' => 'Materials | A Dot Industry', 'heading' => 'Materials'],
    '/industries' => ['view' => 'placeholder', 'title' => 'Industries | A Dot Industry', 'heading' => 'Industries'],
    '/contact' => ['view' => 'placeholder', 'title' => 'Contact | A Dot Industry', 'heading' => 'Contact & Request a Quote'],
];

$page = $routes[$path] ?? null;
if ($page === null) {
    http_response_code(404);
    $page = [
        'view' => 'placeholder',
        'title' => 'Page Not Found | A Dot Industry',
        'heading' => 'Page Not Found',
        'is404' => true,
    ];
}

render_layout($siteConfig, $page);
