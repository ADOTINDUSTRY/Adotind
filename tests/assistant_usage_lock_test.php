<?php
declare(strict_types=1);
require_once __DIR__ . '/../app/lib/assistant_transcripts.php';
$path = tempnam(sys_get_temp_dir(), 'assistant-lock-test-');
if ($path === false) throw new RuntimeException('Temporary database unavailable');
try {
    $usage = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $usage->exec('PRAGMA busy_timeout=300');
    $usage->exec('CREATE TABLE quote_assistant_usage (hour TEXT PRIMARY KEY, calls INTEGER NOT NULL)');
    $usage->exec('BEGIN IMMEDIATE');
    $hour = '2026-11-28-12';
    $q = $usage->prepare('SELECT calls FROM quote_assistant_usage WHERE hour=?');
    $q->execute([$hour]);
    $q->fetchColumn();
    $q->closeCursor();
    $q = $usage->prepare('SELECT COALESCE(SUM(calls),0) FROM quote_assistant_usage WHERE hour>=?');
    $q->execute([$hour]);
    $q->fetchColumn();
    $q->closeCursor();
    $q = null;
    $usage->prepare('INSERT INTO quote_assistant_usage(hour,calls) VALUES(?,1) ON CONFLICT(hour) DO UPDATE SET calls=calls+1')->execute([$hour]);
    $usage->exec('COMMIT');
    $usage = null;
    $transcript = assistant_transcript_open($path);
    $message = assistant_transcript_append($transcript, str_repeat('a',32), 'user', 'Hello', 'home', '');
    assistant_transcript_append($transcript, str_repeat('a',32), 'assistant', 'Hi', 'home', '', null, $message);
    if ((int)$transcript->query('SELECT count(*) FROM assistant_messages')->fetchColumn() !== 2) throw new RuntimeException('Counter and chat could not write sequentially');
    $transcript = null;
    echo "Assistant usage and transcript integration test passed.\n";
} finally {
    @unlink($path);
}
