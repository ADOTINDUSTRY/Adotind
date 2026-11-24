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
        'drawing_picker', 'attachment_picker', 'link', 'button', 'menu_open', 'menu_close',
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
        if (is_int($seq) && $seq > 0 && $seq <= 1000000) $row['seq'] = $seq;
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

    $path = $directory . '/' . gmdate('Y-m-d') . '.jsonl';
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
