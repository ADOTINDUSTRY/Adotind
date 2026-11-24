<?php
declare(strict_types=1);

function site_tracking_record_consent(string $directory, string $origin): never
{
    header('Cache-Control: no-store');
    if (!is_writable($directory)) {
        http_response_code(404);
        exit;
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        http_response_code(405);
        exit;
    }
    if (($_SERVER['HTTP_ORIGIN'] ?? '') !== $origin
        || ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? 'same-origin') !== 'same-origin') {
        http_response_code(403);
        exit;
    }

    $input = file_get_contents('php://input', false, null, 0, 129);
    if ($input === false || strlen($input) > 128) {
        http_response_code(413);
        exit;
    }
    $data = json_decode($input, true, 3);
    $decision = is_array($data) && count($data) === 1 ? ($data['decision'] ?? null) : null;
    if (!in_array($decision, ['accepted', 'declined'], true)) {
        http_response_code(400);
        exit;
    }

    $day = (new DateTimeImmutable('now', new DateTimeZone('Asia/Nicosia')))->format('Y-m-d');
    $file = fopen($directory . '/consent-' . $day . '.json', 'c+b');
    $recorded = false;
    if ($file && flock($file, LOCK_EX)) {
        $raw = fread($file, 129);
        $counts = $raw === '' ? ['accepted' => 0, 'declined' => 0]
            : ($raw === false ? null : json_decode($raw, true, 3));
        if (is_array($counts) && count($counts) === 2
            && is_int($counts['accepted'] ?? null) && $counts['accepted'] >= 0
            && is_int($counts['declined'] ?? null) && $counts['declined'] >= 0
            && $counts[$decision] < PHP_INT_MAX) {
            $counts[$decision]++;
            $updated = json_encode($counts, JSON_THROW_ON_ERROR) . "\n";
            rewind($file);
            $recorded = fwrite($file, $updated) === strlen($updated)
                && ftruncate($file, strlen($updated)) && fflush($file);
        }
        flock($file, LOCK_UN);
    }
    if ($file) fclose($file);

    http_response_code($recorded ? 204 : 503);
    exit;
}

