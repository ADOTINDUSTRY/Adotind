<?php
declare(strict_types=1);

// Keep requests using one storage generation while the CLI imports the old files.
function website_storage_start(string $directory): void
{
    static $migrationLock;
    if (!is_dir($directory)) return;
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && is_file($directory . '/tracking.sqlite')) {
        define('WEBSITE_SQL_STORAGE', true);
        return;
    }
    $migrationLock = fopen($directory . '/website-storage.lock', 'c');
    if (!$migrationLock || !flock($migrationLock, LOCK_SH)) throw new RuntimeException('Storage lock unavailable');
    define('WEBSITE_SQL_STORAGE', is_file($directory . '/tracking.sqlite'));
}

function website_sql_enabled(): bool
{
    return defined('WEBSITE_SQL_STORAGE') && WEBSITE_SQL_STORAGE;
}

function website_tracking_db(string $directory): PDO
{
    static $connections = [];
    $path = $directory . '/tracking.sqlite';
    if (!isset($connections[$path])) {
        if (!is_file($path)) throw new RuntimeException('Tracking database unavailable');
        $db = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $db->exec('PRAGMA busy_timeout=5000');
        $connections[$path] = $db;
    }
    return $connections[$path];
}

function website_save_message(PDO $db, string $kind, array $entry, ?string $legacyKey = null): void
{
    $db->prepare('INSERT INTO website_inbox(kind,submitted_at,payload,legacy_key) VALUES (?,?,?,?) ON CONFLICT(legacy_key) DO NOTHING')
        ->execute([$kind, $entry['submitted_at'], json_encode($entry, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE), $legacyKey]);
}

function website_metadata(array $config, string $name): array
{
    $query = quote_db($config)->prepare('SELECT payload FROM website_metadata WHERE name=?');
    $query->execute([$name]);
    $value = $query->fetchColumn();
    if ($value === false) throw new RuntimeException('Missing website configuration');
    return json_decode($value, true, 512, JSON_THROW_ON_ERROR);
}

function website_save_metadata(array $config, string $name, array $value): void
{
    quote_db($config)->prepare('INSERT INTO website_metadata(name,payload) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET payload=excluded.payload')
        ->execute([$name, json_encode($value, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE)]);
}
