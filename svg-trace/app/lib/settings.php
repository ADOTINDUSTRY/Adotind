<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — admin-configurable system settings (st_system_settings),
 * with safe built-in defaults when a key is missing.
 */

require_once __DIR__ . '/db.php';

final class StSettings
{
    private const DEFAULTS = [
        'upload' => ['max_bytes' => 20971520, 'max_dimension_px' => 6000,
                     'allowed_formats' => ['png', 'jpg', 'jpeg', 'bmp', 'webp']],
        'limits' => ['daily_conversions' => 50, 'concurrent_jobs' => 1, 'storage_mb_per_user' => 500],
        'worker' => ['job_timeout_seconds' => 120, 'concurrency' => 1, 'memory_limit_mb' => 768],
        'retention' => ['days' => 30],
        'maintenance' => ['enabled' => 0],
    ];

    /** @var array<string,array<string,mixed>> */
    private static array $cache = [];

    /** @return array<string,mixed> */
    public static function get(string $key): array
    {
        if (!isset(self::$cache[$key])) {
            $row = StDb::one('SELECT value_json FROM st_system_settings WHERE `key` = ?', [$key]);
            $value = $row !== null ? json_decode((string)$row['value_json'], true) : null;
            self::$cache[$key] = (is_array($value) ? $value : []) + (self::DEFAULTS[$key] ?? []);
        }
        return self::$cache[$key];
    }

    public static function int(string $key, string $field): int
    {
        return (int)(self::get($key)[$field] ?? 0);
    }
}
