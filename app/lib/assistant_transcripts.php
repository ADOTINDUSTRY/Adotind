<?php
declare(strict_types=1);

/** Private assistant conversations, separate from consent-based site analytics. */
function assistant_transcript_open(string $path): PDO
{
    if (!is_file($path)) throw new RuntimeException('Assistant storage is unavailable');
    $db = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $db->exec('PRAGMA busy_timeout=5000');
    $db->exec('PRAGMA foreign_keys=ON');
    $db->exec('CREATE TABLE IF NOT EXISTS assistant_conversations (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS assistant_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE, created_at TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, stage TEXT NOT NULL, service TEXT NOT NULL)');
    $db->exec('CREATE INDEX IF NOT EXISTS assistant_messages_conversation_id ON assistant_messages(conversation_id,id)');
    return $db;
}

/** Each new chat request also removes conversations inactive for 90 days. */
function assistant_transcript_append(PDO $db, string $id, string $role, string $content, string $stage, string $service, ?int $timestamp = null, ?int $userMessageId = null): int
{
    if (!preg_match('/\A[0-9a-f]{32}\z/', $id) || !in_array($role, ['user', 'assistant', 'error'], true)) {
        throw new InvalidArgumentException('Invalid assistant transcript entry');
    }
    $timestamp ??= time();
    $now = gmdate('Y-m-d\TH:i:s\Z', $timestamp);
    $cutoff = gmdate('Y-m-d\TH:i:s\Z', $timestamp - 90 * 86400);
    $db->beginTransaction();
    try {
        $db->prepare('DELETE FROM assistant_conversations WHERE updated_at < ?')->execute([$cutoff]);
        if ($role === 'user') {
            $db->prepare('INSERT INTO assistant_conversations(id,created_at,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at')->execute([$id,$now,$now]);
        } else {
            // A response arriving after the admin deletes a conversation must
            // not restore it or be attached to a newer one from the same session.
            $check = $db->prepare("SELECT 1 FROM assistant_messages WHERE id=? AND conversation_id=? AND role='user'");
            $check->execute([$userMessageId,$id]);
            if (!$check->fetchColumn()) throw new RuntimeException('Original assistant message is no longer available');
            $db->prepare('UPDATE assistant_conversations SET updated_at=? WHERE id=?')->execute([$now,$id]);
        }
        $db->prepare('INSERT INTO assistant_messages(conversation_id,created_at,role,content,stage,service) VALUES(?,?,?,?,?,?)')->execute([$id,$now,$role,$content,$stage,$service]);
        $messageId = (int)$db->lastInsertId();
        $db->commit();
        return $messageId;
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}
