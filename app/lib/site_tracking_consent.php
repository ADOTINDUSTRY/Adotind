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

    $input = file_get_contents('php://input', false, null, 0, 257);
    if ($input === false || strlen($input) > 256) {
        http_response_code(413);
        exit;
    }
    $data = json_decode($input, true, 3);
    $decision = $data['decision'] ?? null;
    $preference = $data['preference'] ?? null;
    $revision = $data['revision'] ?? null;
    if (!is_array($data) || count($data) !== 3 || !in_array($decision, ['accepted', 'declined'], true)
        || !is_string($preference) || !preg_match('/^[a-f0-9]{32}$/D', $preference)
        || !is_int($revision) || $revision < 1 || $revision > 9007199254740991) {
        http_response_code(400);
        exit;
    }

    $day = (new DateTimeImmutable('now', new DateTimeZone('Asia/Nicosia')))->format('Y-m-d');
    http_response_code(site_tracking_save_consent($directory, $day, $decision, $preference, $revision));
    exit;
}

function site_tracking_save_consent(string $directory, string $day, string $decision, string $preference, int $revision): int
{
    $limit = 2097152;
    $path = $directory . '/consent-browsers-' . $day . '.json';
    // Lock a stable file so readers can always open a complete snapshot during replacement.
    $lock = fopen($directory . '/consent-browsers.lock', 'c');
    if (!$lock) return 503;
    try {
        if (!flock($lock, LOCK_EX)) return 503;
        clearstatcache(true, $path);
        if (is_file($path)) {
            $raw = file_get_contents($path, false, null, 0, $limit + 1);
            $record = $raw === false || strlen($raw) > $limit ? null : json_decode($raw, true, 5);
            if (!is_array($record) || ($record['version'] ?? null) !== 1
                || !is_int($record['accepted'] ?? null) || $record['accepted'] < 0
                || !is_int($record['declined'] ?? null) || $record['declined'] < 0
                || !is_string($record['salt'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $record['salt'])
                || !is_array($record['choices'] ?? null)
                || $record['accepted'] + $record['declined'] !== count($record['choices'])) return 503;
        } else {
            $record = ['version' => 1, 'accepted' => 0, 'declined' => 0, 'salt' => bin2hex(random_bytes(32)), 'choices' => []];
        }

        // Keep only a daily digest, independent of the visitor IDs used for opted-in activity.
        $key = hash_hmac('sha256', $preference, $record['salt']);
        $previous = $record['choices'][$key] ?? null;
        if ($previous !== null) {
            if (!is_array($previous) || !is_int($previous['revision'] ?? null)
                || !in_array($previous['decision'] ?? null, ['accepted', 'declined'], true)
                || $record[$previous['decision']] < 1) return 503;
        }
        // Older snapshots only have the last decision. Never reconstruct earlier button presses.
        $entry = $previous ?? ['revision' => 0];
        $entry['prior_revision'] ??= $entry['revision'];
        if ($revision <= $entry['prior_revision'] || isset($entry['buttons'][$revision])) return 204;
        $entry['buttons'][$revision] = $decision;
        if ($revision > $entry['revision']) {
            if ($previous !== null) $record[$previous['decision']]--;
            $record[$decision]++;
            $entry['decision'] = $decision;
            $entry['revision'] = $revision;
        }
        $record['choices'][$key] = $entry;
        $updated = json_encode($record, JSON_THROW_ON_ERROR) . "\n";
        if (strlen($updated) > $limit) return 429;

        $temporary = tempnam($directory, '.consent-');
        if ($temporary === false) return 503;
        try {
            return file_put_contents($temporary, $updated) === strlen($updated) && rename($temporary, $path) ? 204 : 503;
        } finally {
            if (is_file($temporary)) unlink($temporary);
        }
    } finally {
        fclose($lock);
    }
}

