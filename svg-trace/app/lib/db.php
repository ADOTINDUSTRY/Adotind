<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — database layer (PDO, prepared statements only).
 */

require_once __DIR__ . '/config.php';

final class StDb
{
    private static ?PDO $pdo = null;

    public static function pdo(?StConfig $config = null): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }
        $config ??= StConfig::load();
        $config->assertRuntimeReady();
        self::$pdo = new PDO(
            $config->require('SVGTRACE_DB_DSN'),
            $config->require('SVGTRACE_DB_USER'),
            $config->require('SVGTRACE_DB_PASS'),
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
        self::$pdo->exec("SET time_zone = '+00:00'");
        return self::$pdo;
    }

    /** For tests: inject a preconfigured PDO. */
    public static function inject(PDO $pdo): void
    {
        self::$pdo = $pdo;
    }

    /** @return array<string,mixed>|null */
    public static function one(string $sql, array $params = []): ?array
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return list<array<string,mixed>> */
    public static function all(string $sql, array $params = []): array
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function run(string $sql, array $params = []): int
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    public static function insert(string $sql, array $params = []): int
    {
        self::run($sql, $params);
        return (int)self::pdo()->lastInsertId();
    }

    /** Execute $fn inside a transaction; roll back on any throw. */
    public static function tx(callable $fn): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $result = $fn($pdo);
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    public static function utcNow(): string
    {
        return gmdate('Y-m-d H:i:s');
    }
}
