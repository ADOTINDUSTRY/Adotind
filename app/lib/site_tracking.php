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

    $types = ['page', 'click', 'scroll', 'layout', 'upload', 'unsupported_upload', 'quote_started', 'price_shown', 'quote_error', 'order_requested', 'client_error', 'slow_page'];
    $pages = ['home', 'about', 'services', 'service-detail', 'portfolio', 'project-detail', 'machinery', 'materials', 'industries', 'contact', 'online-quote', '404'];
    $tags = ['header', 'nav', 'main', 'section', 'article', 'footer', 'button', 'link', 'form', 'image', 'heading'];
    $mode = $data['mode'] ?? '';
    if (!in_array($mode, ['analytics', 'replay'], true) || !in_array($data['page'] ?? '', $pages, true)) $fail(400);
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
    $records = '';
    foreach ($data['events'] as $event) {
        if (!is_array($event) || !in_array($event['type'] ?? '', $types, true)) continue;
        $type = $event['type'];
        if ($mode !== 'replay' && in_array($type, ['layout', 'scroll', 'click'], true)) continue;
        $row = ['time' => gmdate('c'), 'session' => $data['session'], 'page' => $data['page'], 'type' => $type, 'device' => $device];
        if ($type === 'page' && $maskedIp !== '') $row['network'] = $maskedIp;
        if (in_array($type, ['upload', 'unsupported_upload'], true)) {
            $ext = $event['format'] ?? '';
            $row['format'] = in_array($ext, ['dxf','svg','pdf','png','jpeg','zip'], true) ? $ext : 'other';
        }
        if ($type === 'click' && in_array($event['tag'] ?? '', $tags, true)) $row['tag'] = $event['tag'];
        if (in_array($type, ['click', 'scroll'], true)) {
            foreach (['x','y'] as $axis) $row[$axis] = max(0, min(10000, (int) ($event[$axis] ?? 0)));
        }
        if ($type === 'layout') {
            $row['boxes'] = [];
            foreach (array_slice(is_array($event['boxes'] ?? null) ? $event['boxes'] : [], 0, 40) as $box) {
                if (!is_array($box) || count($box) !== 5 || !in_array($box[0] ?? '', $tags, true)) continue;
                $coords = array_slice(array_values($box), 1);
                if (count(array_filter($coords, 'is_int')) !== 4) continue;
                $row['boxes'][] = [$box[0], ...array_map(static fn(int $n): int => max(0, min(10000, $n)), $coords)];
            }
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

