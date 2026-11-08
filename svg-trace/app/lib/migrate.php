<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — applies data/schema migrations after 001 automatically.
 * 001_initial.sql is installed by hand; later files (002_*.sql, ...) run once
 * each, in order, and are recorded in st_system_settings key "migrations".
 * Each statement must end with ";" at the end of a line.
 */

require_once __DIR__ . '/db.php';

final class StMigrate
{
    /** @return list<string> names applied by this call */
    public static function run(): array
    {
        $files = glob(dirname(__DIR__, 2) . '/migrations/[0-9][0-9][0-9]_*.sql') ?: [];
        $files = array_values(array_filter($files, static fn(string $f): bool =>
            !str_contains($f, 'rollback') && (int)basename($f) >= 2));
        if ($files === []) {
            return [];
        }
        sort($files);
        $row = StDb::one("SELECT value_json FROM st_system_settings WHERE `key` = 'migrations'");
        $done = $row !== null ? (array)json_decode((string)$row['value_json'], true) : [];
        $applied = [];
        foreach ($files as $file) {
            $name = basename($file, '.sql');
            if (in_array($name, $done, true)) {
                continue;
            }
            $sql = (string)file_get_contents($file);
            $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? '';
            foreach (preg_split('/;\s*$/m', $sql) ?: [] as $stmt) {
                if (trim($stmt) !== '') {
                    StDb::pdo()->exec($stmt);
                }
            }
            $done[] = $name;
            $applied[] = $name;
            StDb::run(
                "INSERT INTO st_system_settings (`key`, value_json, updated_at) VALUES ('migrations', ?, UTC_TIMESTAMP())
                 ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = UTC_TIMESTAMP()",
                [json_encode(array_values($done))]
            );
        }
        return $applied;
    }
}
