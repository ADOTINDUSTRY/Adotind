<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — private file storage.
 *
 * Files live OUTSIDE the web root (default: domains/adotind.com/svgtrace-storage).
 * Nothing here is ever served directly by the web server; a download controller
 * streams files after ownership checks. All file names are random; the original
 * client filename is metadata only and never used on disk.
 */

require_once __DIR__ . '/config.php';

final class StStorage
{
    public const KINDS = ['originals', 'outputs', 'previews', 'temporary'];

    public static function root(?StConfig $config = null): string
    {
        $config ??= StConfig::load();
        $custom = $config->get('SVGTRACE_STORAGE_DIR');
        if (is_string($custom) && $custom !== '') {
            return rtrim($custom, '/');
        }
        // domains/adotind.com/svgtrace-storage (sibling of public_html)
        return dirname(__DIR__, 5) . '/svgtrace-storage';
    }

    public static function ensureLayout(?StConfig $config = null): void
    {
        $root = self::root($config);
        foreach (self::KINDS as $kind) {
            $dir = $root . '/' . $kind;
            if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
                throw new RuntimeException("Cannot create storage directory: {$dir}");
            }
        }
    }

    /** New random stored filename (no user input involved). */
    public static function newStoredName(string $extension): string
    {
        $ext = strtolower(preg_replace('/[^a-z0-9]/', '', $extension) ?? '');
        return bin2hex(random_bytes(16)) . ($ext !== '' ? '.' . $ext : '');
    }

    /** Absolute path for a stored file. Stored name is validated strictly. */
    public static function pathFor(string $kindDir, string $storedName): string
    {
        if (!in_array($kindDir, self::KINDS, true)) {
            throw new InvalidArgumentException('Unknown storage kind.');
        }
        if (preg_match('/^[a-f0-9]{32}(\.[a-z0-9]{1,8})?$/', $storedName) !== 1) {
            throw new InvalidArgumentException('Invalid stored name.');
        }
        return self::root() . '/' . $kindDir . '/' . $storedName;
    }

    /**
     * Move/write a file into private storage.
     * Returns [stored_name, absolute_path, size_bytes, sha256].
     *
     * @return array{0:string,1:string,2:int,3:string}
     */
    public static function store(string $kindDir, string $sourcePath, string $extension): array
    {
        self::ensureLayout();
        $name = self::newStoredName($extension);
        $dest = self::pathFor($kindDir, $name);
        if (!@rename($sourcePath, $dest)) {
            if (!@copy($sourcePath, $dest)) {
                throw new RuntimeException('Failed to store file.');
            }
            @unlink($sourcePath);
        }
        chmod($dest, 0640);
        $size = filesize($dest);
        $hash = hash_file('sha256', $dest);
        return [$name, $dest, $size === false ? 0 : (int)$size, is_string($hash) ? $hash : ''];
    }

    public static function delete(string $kindDir, string $storedName): bool
    {
        $path = self::pathFor($kindDir, $storedName);
        return is_file($path) ? @unlink($path) : true;
    }

    /**
     * Stream a stored file to the browser after the caller has verified access.
     * Never call without an ownership/admin check first.
     */
    public static function stream(string $kindDir, string $storedName, string $downloadName, string $mime, bool $inline = false): never
    {
        $path = self::pathFor($kindDir, $storedName);
        if (!is_file($path)) {
            http_response_code(404);
            exit('Not found.');
        }
        $safeName = preg_replace('/[^A-Za-z0-9._-]+/', '_', $downloadName) ?: 'download';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . (string)filesize($path));
        header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment')
            . '; filename="' . $safeName . '"');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, no-store');
        readfile($path);
        exit;
    }

    /** Total bytes used by one user (from DB file metadata). */
    public static function userUsageBytes(int $userId): int
    {
        require_once __DIR__ . '/db.php';
        $row = StDb::one(
            'SELECT COALESCE(SUM(size_bytes),0) AS used FROM st_files
             WHERE user_id = ? AND deleted_at IS NULL',
            [$userId]
        );
        return (int)($row['used'] ?? 0);
    }
}
