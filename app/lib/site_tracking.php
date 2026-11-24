<?php
declare(strict_types=1);

function site_tracking_collect(string $directory, string $origin): never
{
    header('Cache-Control: no-store');
    $fail = static function (int $status): never { http_response_code($status); exit; };
    if (!is_writable($directory)) $fail(404);
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') $fail(405);
    if (($_SERVER['HTTP_ORIGIN'] ?? '') !== $origin) $fail(403);
    $input = file_get_contents('php://input', false, null, 0, 12001);
    if ($input === false || strlen($input) > 12000) $fail(413);
    $data = json_decode($input, true, 8);
    if (!is_array($data) || !is_string($data['session'] ?? null)
        || !preg_match('/^[a-f0-9]{32}$/D', $data['session'])
        || !is_array($data['events'] ?? null) || count($data['events']) > 20) $fail(400);

    $analytics = [
        'page', 'upload', 'unsupported_upload', 'quote_started', 'price_shown', 'quote_error',
        'order_requested', 'client_error', 'slow_page', 'contact_sent', 'contact_error',
        'quote_updates_requested', 'quote_updates_error', 'quote_preview_ready', 'quote_preview_error', 'quote_blocked',
    ];
    $activity = ['click', 'form_submitted', 'scroll_depth', 'scroll_movement', 'page_backgrounded', 'page_resumed', 'upload_removed'];
    $clickTargets = [
        'navigation', 'service', 'project', 'contact', 'quote', 'phone', 'email', 'whatsapp',
        'viber', 'directions', 'quote_file_guide', 'drawing_preview', 'menu', 'portfolio_filter',
        'drawing_picker', 'attachment_picker', 'link', 'button', 'menu_open', 'menu_close', 'page_area', 'control',
    ];
    $formTargets = ['contact_form', 'quote_updates', 'quote_order'];
    $pages = ['home', 'about', 'services', 'service-detail', 'portfolio', 'project-detail', 'machinery', 'materials', 'industries', 'contact', 'online-quote', '404'];
    $reasons = [
        'quote_error' => [
            'access_required', 'validation_failed', 'manual_quote_required', 'invalid_dimensions', 'file_missing',
            'upload_failed', 'unsupported_format', 'file_too_large', 'file_save_failed', 'invalid_options',
            'pricing_not_configured', 'drawing_unreadable', 'quote_unavailable', 'quote_expired',
            'contact_details_incomplete', 'invalid_email',
        ],
        'quote_preview_error' => ['file_too_large', 'drawing_unreadable'],
        'quote_blocked' => ['manual_quote_required'],
    ];
    $mode = $data['mode'] ?? '';
    if (!in_array($mode, ['analytics', 'activity', 'replay'], true) || !in_array($data['page'] ?? '', $pages, true)) $fail(400);
    $types = $mode === 'analytics' ? $analytics : array_merge($analytics, $activity);
    $device = in_array($data['device'] ?? '', ['mobile', 'desktop'], true) ? $data['device'] : 'unknown';
    $address = $_SERVER['REMOTE_ADDR'] ?? '';
    if (preg_match('/^172\.18\./', $address)) {
        // The public app is reached through its Traefik Docker network.
        $address = $_SERVER['HTTP_X_REAL_IP'] ?? '';
    }
    $packed = filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) ? inet_pton($address) : false;
    $maskedIp = $packed === false ? '' : (strlen($packed) === 4
        ? inet_ntop(substr($packed, 0, 3) . "\0") . '/24'
        : inet_ntop(substr($packed, 0, 6) . str_repeat("\0", 10)) . '/48');
    $receivedAt = (int)floor(microtime(true) * 1000);
    $visitor = $data['visitor'] ?? null;
    $visitorDay = null;
    $country = null;
    if ($mode === 'activity' && is_string($visitor) && preg_match('/^[a-f0-9]{32}$/D', $visitor)) {
        $cyprusNow = new DateTimeImmutable('now', new DateTimeZone('Asia/Nicosia'));
        $day = $cyprusNow->format('Y-m-d');
        if (($data['visitor_day'] ?? null) === $day) $visitorDay = $day;
    }
    $sources = ['direct','google','bing','duckduckgo','yahoo','facebook','instagram','whatsapp','referral','other_search'];
    $media = ['organic_search','social','referral','direct','paid','email'];
    $records = '';
    foreach ($data['events'] as $event) {
        if (!is_array($event) || !in_array($event['type'] ?? '', $types, true)) continue;
        $type = $event['type'];
        $at = $event['at'] ?? null;
        if (!is_int($at) || $at < $receivedAt - 300000 || $at > $receivedAt + 30000) $at = $receivedAt;
        $occurredAt = gmdate('Y-m-d\TH:i:s', intdiv($at, 1000)) . sprintf('.%03dZ', $at % 1000);
        $row = [
            'time' => gmdate('c', intdiv($receivedAt, 1000)), 'occurred_at' => $occurredAt,
            'session' => $data['session'], 'page' => $data['page'], 'type' => $type, 'device' => $device,
        ];
        $seq = $event['seq'] ?? null;
        if (in_array($data['audience'] ?? null, ['public','testing'], true)) $row['audience'] = $data['audience'];
        if (is_int($seq) && $seq > 0 && $seq <= 1000000) $row['seq'] = $seq;
        if ($visitorDay !== null && $cyprusNow->setTimestamp(intdiv($at, 1000))->format('Y-m-d') === $visitorDay) {
            $row['visitor'] = $visitor;
            $row['visitor_day'] = $visitorDay;
            if ($type === 'page') {
                if ($country === null) {
                    $geoLibrary = __DIR__ . '/site_tracking_geo.php';
                    if ($packed !== false && is_file($geoLibrary)) {
                        require_once $geoLibrary;
                        $country = site_tracking_country($address) ?? '';
                    } else {
                        $country = '';
                    }
                }
                if (preg_match('/^[A-Z]{2}$/D', $country)) $row['country'] = $country;
                $source = $event['source'] ?? null;
                if (in_array($source, $sources, true)) {
                    $row['source'] = $source;
                    if (in_array($event['medium'] ?? null, $media, true)) $row['medium'] = $event['medium'];
                    if (($row['medium'] ?? '') === 'paid' && is_string($event['campaign'] ?? null)
                        && preg_match('/^ad-[1-9][0-9]{0,7}$/D', $event['campaign'])) $row['campaign'] = $event['campaign'];
                    $landingDetail = site_tracking_destination_detail($data['page'], $event['landing_slug'] ?? null);
                    if ($landingDetail !== null) $row['landing_detail'] = $landingDetail;
                }
            }
        }
        if ($type === 'page' && $maskedIp !== '') $row['network'] = $maskedIp;
        if (in_array($type, ['upload', 'unsupported_upload'], true)) {
            $ext = $event['format'] ?? '';
            $row['format'] = in_array($ext, ['dxf','svg','pdf','png','jpeg','zip','webp','dwg'], true) ? $ext : 'other';
        }
        if (in_array($type, ['upload', 'unsupported_upload', 'upload_removed'], true)
            && in_array($event['field'] ?? '', ['drawing','contact_attachment'], true)) {
            $row['field'] = $event['field'];
        }
        if ($type === 'click' || $type === 'form_submitted') {
            $target = $event['target'] ?? '';
            if (!in_array($target, $type === 'click' ? $clickTargets : $formTargets, true)) continue;
            $row['target'] = $target;
        }
        if ($type === 'click') {
            $row += site_tracking_click_context($data['page'], $target, $event);
            $horizontal = $event['point_x'] ?? null;
            $vertical = $event['point_y'] ?? null;
            if (($row['click_input'] ?? '') !== 'keyboard'
                && is_int($horizontal) && $horizontal >= 0 && $horizontal <= 100
                && is_int($vertical) && $vertical >= 0 && $vertical <= 100) {
                $row['point_x'] = $horizontal;
                $row['point_y'] = $vertical;
            }
            $destination = $event['destination'] ?? '';
            if (in_array($destination, $pages, true) && $destination !== '404') {
                $row['destination'] = $destination;
                $detail = site_tracking_destination_detail($destination, $event['destination_slug'] ?? null);
                if ($detail !== null) $row['destination_detail'] = $detail;
            }
        }
        if ($type === 'scroll_movement') {
            $direction = $event['direction'] ?? '';
            $depth = $event['depth'] ?? null;
            if (!in_array($direction, ['up', 'down'], true) || !is_int($depth) || $depth < 0 || $depth > 100) continue;
            $row['direction'] = $direction;
            $row['depth'] = $depth;
        }
        if ($type === 'scroll_depth') {
            if (!in_array($event['depth'] ?? 0, [25, 50, 75, 100], true)) continue;
            $row['depth'] = $event['depth'];
        }
        if (isset($reasons[$type]) && in_array($event['reason'] ?? '', $reasons[$type], true)) {
            $row['reason'] = $event['reason'];
        }
        $records .= json_encode($row, JSON_THROW_ON_ERROR) . "\n";
    }
    if ($records === '') $fail(204);

    $day = gmdate('Y-m-d');
    if (website_sql_enabled()) {
        $db = website_tracking_db($directory);
        try {
            $db->beginTransaction();
            $reserve = $db->prepare('INSERT INTO event_bytes(day,total) VALUES (?,?)
                ON CONFLICT(day) DO UPDATE SET total=total+excluded.total WHERE total+excluded.total <= 2097152');
            $reserve->execute([$day,strlen($records)]);
            if (!$reserve->rowCount()) {
                $db->rollBack();
                $fail(429);
            }
            $insert = $db->prepare('INSERT INTO events(day,payload) VALUES (?,?)');
            foreach (explode("\n", rtrim($records, "\n")) as $record) $insert->execute([$day,$record]);
            $db->commit();
        } catch (PDOException $error) {
            if ($db->inTransaction()) $db->rollBack();
            $fail(503);
        }
        $fail(204);
    }
    $path = $directory . '/' . $day . '.jsonl';
    $file = fopen($path, 'ab');
    if (!$file) $fail(503);
    $written = false;
    if (flock($file, LOCK_EX)) {
        $info = fstat($file);
        if ($info && $info['size'] + strlen($records) <= 2097152) {
            $written = fwrite($file, $records) === strlen($records);
        }
        flock($file, LOCK_UN);
    }
    fclose($file);
    $fail($written ? 204 : 429);
}

function site_tracking_click_context(string $page, string $target, array $event): array
{
    static $siteSections = [
        'header' => 'Site header',
        'main-navigation' => 'Main navigation',
        'breadcrumbs' => 'Breadcrumb navigation',
        'footer' => 'Site footer',
        'page-intro' => 'Page introduction',
        'page-content' => 'Page content',
    ];
    static $pageSections = [
        'home' => [
            'manufacturing' => 'What we manufacture',
            'sign-manufacturing' => 'Sign manufacturing card',
            'cnc-routers' => 'CNC router services card',
            'laser-cutting' => 'Laser cutting card',
            'fabrication' => 'Industrial fabrication card',
            'featured-services' => 'Featured services',
            'signage-systems' => 'Signage systems card',
            'cnc-laser' => 'CNC and laser production card',
            'printing' => 'Large format printing card',
            'custom-fabrication' => 'Custom fabrication card',
            'featured-projects' => 'Featured projects',
            'equipment-and-materials' => 'Machinery and materials',
            'equipment' => 'Machinery and technology',
            'materials' => 'Materials',
            'advantages-and-workflow' => 'Manufacturing and workflow',
            'advantages' => 'Why businesses choose us',
            'workflow' => 'Manufacturing process',
            'industries' => 'Industries served',
            'request-quote' => 'Request a quote section',
        ],
        'about' => [
            'approach' => 'Our approach',
            'quality' => 'Quality and precision',
            'commitment' => 'Our commitment',
        ],
        'services' => ['service-list' => 'Services list'],
        'service-detail' => [
            'applications' => 'Applications',
            'materials' => 'Common materials',
            'process' => 'Manufacturing process',
            'related-services' => 'Related services',
        ],
        'portfolio' => [
            'portfolio-filters' => 'Portfolio filters',
            'project-gallery' => 'Project gallery',
            'project-card' => 'Project card',
        ],
        'project-detail' => [
            'materials' => 'Materials used',
            'techniques' => 'Manufacturing techniques',
            'assets' => 'Project assets',
        ],
        'machinery' => [
            'machine-list' => 'Machinery list',
            'machine-specifications' => 'Machine specifications',
        ],
        'materials' => ['material-list' => 'Materials list'],
        'industries' => ['industry-list' => 'Industries list'],
        'contact' => [
            'direct-contact' => 'Direct contact',
            'inquiry-form' => 'Inquiry form',
        ],
        'online-quote' => [
            'quote-access' => 'Quote testing access',
            'quote-updates' => 'Quote launch updates',
            'quote-workspace' => 'Quote workspace',
            'drawing-upload' => 'Drawing upload',
            'drawing-preview' => 'Drawing preview',
            'material-and-machine' => 'Material and machine',
            'part-details' => 'Part details',
            'calculate-quote' => 'Calculate quote',
            'quote-result' => 'Quote result',
            'order-booking' => 'Order booking',
        ],
    ];
    static $siteControls = [
        'home-logo' => 'Company logo',
        'request-quote' => 'Request a Quote',
        'facebook' => 'Facebook',
    ];
    static $pageControls = [
        'home' => [
            'request-custom-quote' => 'Request a Custom Quote',
            'explore-capabilities' => 'Explore Capabilities',
        ],
        'service-detail' => ['all-services' => 'Back to All Services'],
        'project-detail' => ['back-to-portfolio' => 'Back to Portfolio'],
        'portfolio' => [
            'filter-all' => 'All projects',
            'filter-signage' => 'Signage filter',
            'filter-illuminated-signs' => 'Illuminated Signs filter',
            'filter-cnc' => 'CNC filter',
            'filter-laser-cutting' => 'Laser Cutting filter',
            'filter-printing' => 'Printing filter',
            'filter-fabrication' => 'Fabrication filter',
        ],
        'contact' => [
            'customer-name' => 'Customer Name field',
            'company-name' => 'Company Name field',
            'contact-email' => 'Email field',
            'contact-phone' => 'Phone field',
            'required-service' => 'Service Required field',
            'project-description' => 'Project Description field',
            'contact-dimensions' => 'Dimensions field',
            'contact-material' => 'Material field',
            'contact-quantity' => 'Quantity field',
            'reference-upload' => 'Upload Drawings / Reference',
            'send-inquiry' => 'Send Inquiry',
        ],
        'online-quote' => [
            'open-quote' => 'Open Quote System',
            'email-updates' => 'Email for updates field',
            'notify-me' => 'Notify Me',
            'dxf-guide' => 'DXF file guide',
            'drawing-software' => 'Drawing software selector',
            'dxf-upload' => 'DXF file picker',
            'expand-preview' => 'View drawing fullscreen',
            'close-preview' => 'Close fullscreen drawing',
            'quote-material' => 'Material selector',
            'quote-machine' => 'Machine selector',
            'drawing-contents' => 'Drawing contents selector',
            'part-width' => 'Part Width field',
            'part-height' => 'Part Height field',
            'part-quantity' => 'Quantity field',
            'part-notes' => 'Notes field',
            'calculate-quote' => 'Calculate Quote',
            'order-name' => 'Full Name field',
            'order-email' => 'Email field',
            'order-phone' => 'Phone field',
            'order-message' => 'Message field',
            'book-order' => 'Book Order',
        ],
    ];
    $row = [];
    $section = $event['section'] ?? null;
    if (is_string($section)) {
        $label = $pageSections[$page][$section] ?? $siteSections[$section] ?? null;
        if ($label !== null) $row['section'] = $label;
    }
    $control = $event['control'] ?? null;
    if ($target !== 'page_area' && is_string($control)) {
        $label = $pageControls[$page][$control] ?? $siteControls[$control] ?? null;
        if ($label !== null) $row['control'] = $label;
    }
    $surface = $event['surface'] ?? null;
    if ($target === 'page_area' && in_array($surface, ['heading', 'image', 'copy', 'blank', 'canvas'], true)) {
        $row['surface'] = $surface;
    }
    $input = $event['click_input'] ?? null;
    if (in_array($input, ['mouse', 'touch', 'pen', 'keyboard'], true)) {
        $row['click_input'] = $input;
        if ($input !== 'keyboard' && ($event['repeat_count'] ?? null) === 3) $row['repeat_count'] = 3;
    }
    return $row;
}

function site_tracking_destination_detail(string $destination, mixed $slug): ?string
{
    if (!in_array($destination, ['service-detail', 'project-detail'], true)
        || !is_string($slug) || !preg_match('/^[a-z0-9-]{1,80}$/D', $slug)) return null;

    static $namesByDestination = [];
    if (!isset($namesByDestination[$destination])) {
        $isService = $destination === 'service-detail';
        $items = require __DIR__ . ($isService ? '/../data/services.php' : '/../data/projects.php');
        $namesByDestination[$destination] = array_column($items, $isService ? 'name' : 'title', 'slug');
    }
    return $namesByDestination[$destination][$slug] ?? null;
}
