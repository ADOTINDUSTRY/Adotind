<?php
declare(strict_types=1);
require_once __DIR__ . '/../app/lib/assistant_transcripts.php';

function expect_transcript(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

$path = tempnam(sys_get_temp_dir(), 'assistant-test-');
if ($path === false) throw new RuntimeException('Could not create temporary database');
try {
    $db = assistant_transcript_open($path);
    $id = str_repeat('a',32);
    $old = str_repeat('b',32);
    $now = strtotime('2026-11-28 12:00:00 UTC');
    assistant_transcript_append($db, $old, 'user', 'old', 'home', '', $now - 91 * 86400);
    $userId = assistant_transcript_append($db, $id, 'user', 'Can you cut acrylic?', 'service-detail', 'CNC', $now);
    assistant_transcript_append($db, $id, 'assistant', 'Yes, tell me the size.', 'service-detail', 'CNC', $now + 1, $userId);
    assistant_transcript_append($db, $id, 'error', 'Please try again.', 'home', '', $now + 2, $userId);
    $rows = $db->query('SELECT role,content,stage,service FROM assistant_messages ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    expect_transcript(count($rows) === 3, 'Expired conversation and its messages should be removed together.');
    expect_transcript($rows[0]['role'] === 'user' && $rows[0]['content'] === 'Can you cut acrylic?', 'The actual message must be saved.');
    expect_transcript($rows[1]['role'] === 'assistant' && $rows[1]['content'] === 'Yes, tell me the size.', 'The assistant answer must be saved in order.');
    expect_transcript($rows[2]['role'] === 'error' && $rows[2]['content'] === 'Please try again.', 'A visible failure must be saved.');
    expect_transcript($rows[0]['stage'] === 'service-detail' && $rows[0]['service'] === 'CNC', 'Page context must be saved.');
    expect_transcript((int)$db->query('SELECT COUNT(*) FROM assistant_conversations')->fetchColumn() === 1, 'A single conversation must group its messages.');
    $db->prepare('DELETE FROM assistant_conversations WHERE id=?')->execute([$id]);
    $newId = assistant_transcript_append($db, $id, 'user', 'A fresh chat', 'home', '', $now + 3);
    try {
        assistant_transcript_append($db, $id, 'assistant', 'A late reply', 'home', '', $now + 4, $userId);
        throw new LogicException('A deleted message was allowed to receive a reply');
    } catch (RuntimeException $expected) {}
    expect_transcript((int)$db->query('SELECT COUNT(*) FROM assistant_messages')->fetchColumn() === 1, 'A deleted conversation response must not be attached to a newer chat.');
    assistant_transcript_append($db, $id, 'assistant', 'Fresh reply', 'home', '', $now + 5, $newId);
    try { assistant_transcript_append($db, 'not-an-id', 'user', 'bad', 'home', '', $now); throw new RuntimeException('Invalid id accepted'); }
    catch (InvalidArgumentException $expected) {}
    $db = null;
    echo "Assistant transcript tests passed.\n";
} finally {
    @unlink($path);
}
