<?php
declare(strict_types=1);

require_once __DIR__ . '/app/config/site.php';
require_once __DIR__ . '/app/lib/functions.php';
require_once __DIR__ . '/app/lib/contact_form.php';
require_once __DIR__ . '/app/lib/dashboard.php';

session_start();

$services = require __DIR__ . '/app/data/services.php';
$projects = require __DIR__ . '/app/data/projects.php';
$machinery = require __DIR__ . '/app/data/machinery.php';
$mediaLibrary = dashboard_media_load($siteConfig);
$settings = dashboard_settings_load($siteConfig);
$resolvedLogoUrl = '';
if (!empty($settings['logo_url']) && is_string($settings['logo_url'])) {
    $resolvedLogoUrl = $settings['logo_url'];
}
if ($resolvedLogoUrl === '') {
    for ($i = count($mediaLibrary) - 1; $i >= 0; $i--) {
        $item = $mediaLibrary[$i];
        $title = strtolower((string)($item['title'] ?? ''));
        if (((($item['category'] ?? '') === 'logo') || str_contains($title, 'logo')) && !empty($item['url'])) {
            $resolvedLogoUrl = (string)$item['url'];
            break;
        }
    }
}
// Fallback for cases where a logo was uploaded without "logo" naming/category.
if ($resolvedLogoUrl === '' && $mediaLibrary !== []) {
    $last = $mediaLibrary[array_key_last($mediaLibrary)];
    if (!empty($last['url']) && is_string($last['url'])) {
        $resolvedLogoUrl = $last['url'];
    }
}
// Use logo URL only when the file is actually present.
if ($resolvedLogoUrl !== '' && starts_with($resolvedLogoUrl, '/')) {
    $localPath = __DIR__ . $resolvedLogoUrl;
    if (is_file($localPath)) {
        $siteConfig['logo_url'] = $resolvedLogoUrl;
    } else {
        $siteConfig['logo_url'] = '';
    }
} else {
    $siteConfig['logo_url'] = $resolvedLogoUrl;
}
$publicMedia = array_values(array_filter(
    $mediaLibrary,
    static function (array $m) use ($siteConfig): bool {
        $title = strtolower((string)($m['title'] ?? ''));
        if (($m['category'] ?? '') === 'logo' || str_contains($title, 'logo')) {
            return false;
        }
        return (($m['url'] ?? '') !== ($siteConfig['logo_url'] ?? ''));
    }
));

$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = '/' . trim($uriPath, '/');
if ($path === '//') {
    $path = '/';
}

$routes = [
    '/' => [
        'view' => 'home',
        'title' => 'A Dot Industry | Sign Manufacturing, CNC, Laser Cutting & Fabrication in Cyprus',
        'description' => 'A Dot Industry delivers premium signage manufacturing, CNC router services, laser cutting, large-format printing and industrial fabrication in Cyprus.',
        'schema' => 'home',
        'media' => $publicMedia,
        'breadcrumbs' => [['label' => 'Home', 'href' => '/']],
    ],
    '/about' => [
        'view' => 'about',
        'title' => 'About A Dot Industry | Industrial Manufacturing Company in Cyprus',
        'description' => 'Learn about A Dot Industry Enterprises Ltd and our manufacturing approach across signage, CNC, laser processing, printing and fabrication.',
        'breadcrumbs' => [['label' => 'Home', 'href' => '/'], ['label' => 'About', 'href' => '/about']],
    ],
    '/services' => [
        'view' => 'services',
        'title' => 'Services | A Dot Industry Manufacturing Capabilities',
        'description' => 'Explore sign manufacturing, CNC router services, laser cutting and engraving, printing, fabrication and 3D manufacturing solutions.',
        'services' => $services,
        'breadcrumbs' => [['label' => 'Home', 'href' => '/'], ['label' => 'Services', 'href' => '/services']],
    ],
    '/portfolio' => [
        'view' => 'portfolio',
        'title' => 'Portfolio | A Dot Industry Projects',
        'description' => 'Explore project categories across signage, illuminated signs, CNC, laser cutting, printing and fabrication.',
        'projects' => $projects,
        'media' => $publicMedia,
        'breadcrumbs' => [['label' => 'Home', 'href' => '/'], ['label' => 'Portfolio', 'href' => '/portfolio']],
    ],
    '/machinery' => [
        'view' => 'machinery',
        'title' => 'Machinery & Technology | A Dot Industry',
        'description' => 'Overview of production machinery and technical workflows used by A Dot Industry in Cyprus.',
        'machinery' => $machinery,
        'breadcrumbs' => [['label' => 'Home', 'href' => '/'], ['label' => 'Machinery', 'href' => '/machinery']],
    ],
    '/materials' => [
        'view' => 'materials',
        'title' => 'Materials | Aluminium, Steel, Acrylic, ACP, PVC & More',
        'description' => 'Materials used in signage, CNC and fabrication workflows including aluminium, steel, acrylic, ACP, PVC, plywood, HPL and films.',
        'breadcrumbs' => [['label' => 'Home', 'href' => '/'], ['label' => 'Materials', 'href' => '/materials']],
    ],
    '/industries' => [
        'view' => 'industries',
        'title' => 'Industries Served | A Dot Industry',
        'description' => 'Manufacturing support for retail, hospitality, corporate, architecture, agencies, interior design and industrial sectors.',
        'breadcrumbs' => [['label' => 'Home', 'href' => '/'], ['label' => 'Industries', 'href' => '/industries']],
    ],
    '/contact' => [
        'view' => 'contact',
        'title' => 'Contact & Request a Quote | A Dot Industry',
        'description' => 'Request a quote for signage, CNC, laser cutting, printing and fabrication projects in Cyprus.',
        'breadcrumbs' => [['label' => 'Home', 'href' => '/'], ['label' => 'Contact', 'href' => '/contact']],
    ],
    '/dashboard' => [
        'view' => 'dashboard',
        'title' => 'Dashboard | A Dot Industry',
        'description' => 'Private dashboard for managing project media.',
        'media' => $mediaLibrary,
        'breadcrumbs' => [['label' => 'Home', 'href' => '/'], ['label' => 'Dashboard', 'href' => '/dashboard']],
    ],
];

if ($path === '/contact/submit') {
    handle_contact_submit($siteConfig);
}
if ($path === '/dashboard/login') {
    dashboard_handle_login($siteConfig);
}
if ($path === '/dashboard/logout') {
    dashboard_handle_logout();
}
if ($path === '/dashboard/upload') {
    dashboard_handle_upload($siteConfig);
}
if ($path === '/dashboard/update-media') {
    dashboard_handle_update_meta($siteConfig);
}
if ($path === '/dashboard/set-logo') {
    dashboard_handle_set_logo($siteConfig);
}

$page = $routes[$path] ?? null;

if ($page === null && starts_with($path, '/services/')) {
    $slug = substr($path, strlen('/services/'));
    foreach ($services as $service) {
        if ($service['slug'] === $slug) {
            $page = [
                'view' => 'service-detail',
                'title' => $service['name'] . ' | A Dot Industry',
                'description' => $service['summary'],
                'service' => $service,
                'breadcrumbs' => [
                    ['label' => 'Home', 'href' => '/'],
                    ['label' => 'Services', 'href' => '/services'],
                    ['label' => $service['name'], 'href' => '/services/' . $service['slug']],
                ],
            ];
            break;
        }
    }
}

if ($page === null && starts_with($path, '/portfolio/')) {
    $slug = substr($path, strlen('/portfolio/'));
    foreach ($projects as $project) {
        if ($project['slug'] === $slug) {
            $page = [
                'view' => 'project-detail',
                'title' => $project['title'] . ' | A Dot Industry Portfolio',
                'description' => $project['description'],
                'project' => $project,
                'breadcrumbs' => [
                    ['label' => 'Home', 'href' => '/'],
                    ['label' => 'Portfolio', 'href' => '/portfolio'],
                    ['label' => $project['title'], 'href' => '/portfolio/' . $project['slug']],
                ],
            ];
            break;
        }
    }
}

if ($page === null) {
    $legacyPrefixes = ['/category/', '/tag/', '/author/', '/feed/', '/wp-admin/', '/wp-content/', '/wp-includes/'];
    foreach ($legacyPrefixes as $prefix) {
        if (starts_with($path, $prefix)) {
            redirect('/', 301);
        }
    }
    http_response_code(404);
    $page = [
        'view' => '404',
        'title' => '404 Not Found | A Dot Industry',
        'description' => 'The requested page could not be found.',
        'breadcrumbs' => [['label' => 'Home', 'href' => '/'], ['label' => '404', 'href' => current_path()]],
    ];
}

render_layout($siteConfig, $page);
