<?php
declare(strict_types=1);

$siteConfig = [
    'brand' => 'A Dot Industry',
    'legal_name' => 'A Dot Industry Enterprises Ltd',
    'base_url' => 'https://adotind.com',
    'phone' => '+357 97840173',
    'phone_href' => '+35797840173',
    'email' => 'info@adotind.com',
    'logo_url' => '',
    'static_logo_candidates' => [
        '/public/assets/branding/logo.webp',
        '/public/assets/branding/logo.png',
        '/public/assets/branding/logo.jpg',
        '/public/assets/branding/logo.jpeg',
    ],
    'whatsapp' => 'https://wa.me/35797840173',
    'viber' => 'viber://chat?number=%2B35797840173',
    'facebook' => 'https://facebook.com/adotind',
    'country' => 'Cyprus',
    'location_text' => 'A Dot Industry location on Google Maps',
    'maps_url' => 'https://maps.app.goo.gl/YQuh9Twvw16KqsqNA?g_st=ic',
    'dashboard_user' => 'admin',
    'dashboard_password_hash' => '$2y$12$bpYZo9TtXGlQDwF1d2zK5ewzKW5/pWQ56mXvX5u7GLqG5cbsoe6L2',
    // Media and dashboard data live OUTSIDE the Adotind folder (public_html/adotind-media)
    // so deployments that replace the Adotind directory never wipe uploads or settings.
    // Images are served through the /media/<filename> endpoint in the app, so URLs keep
    // working even though the root .htaccess routes all requests into Adotind.
    'uploads_url_base' => '/media',
    'uploads_dir' => dirname(__DIR__, 3) . '/adotind-media/uploads',
    'media_index_file' => dirname(__DIR__, 3) . '/adotind-media/library.json',
    'media_settings_file' => dirname(__DIR__, 3) . '/adotind-media/settings.json',
    'inquiries_dir' => dirname(__DIR__, 3) . '/adotind-media/inquiries',
];
