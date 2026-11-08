<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — configuration loader.
 *
 * All secrets and hosting-specific values live in an env file OUTSIDE the web
 * root and OUTSIDE the deploy folder, e.g.:
 *   /home/<user>/domains/adotind.com/svgtrace.env
 *
 * The file is never committed. See docs/svg-trace/ENVIRONMENT_VARIABLES.md.
 * This loader has zero dependencies and fails closed: missing required keys
 * produce a clear configuration error, never a silently insecure default.
 */

final class StConfig
{
    /** @var array<string,string> */
    private array $values = [];

    /** @param array<string,string> $values */
    private function __construct(array $values)
    {
        $this->values = $values;
    }

    public static function load(?string $envFile = null): self
    {
        $candidates = [];
        if ($envFile !== null) {
            $candidates[] = $envFile;
        }
        $appRoot = dirname(__DIR__, 2); // svg-trace/
        // Preferred locations, all outside the deploy folder / web root.
        $candidates[] = dirname($appRoot, 3) . '/svgtrace.env'; // domains/adotind.com/svgtrace.env
        $candidates[] = dirname($appRoot, 4) . '/svgtrace.env'; // home dir fallback
        $candidates[] = $appRoot . '/svgtrace.env';             // local dev only (gitignored)

        $values = [];
        foreach ($candidates as $file) {
            if (is_string($file) && is_file($file) && is_readable($file)) {
                $values = self::parseEnvFile($file);
                break;
            }
        }
        // Real environment variables always win over the file.
        foreach ($_SERVER as $k => $v) {
            if (str_starts_with((string)$k, 'SVGTRACE_') && is_string($v)) {
                $values[$k] = $v;
            }
        }
        return new self($values);
    }

    /** @return array<string,string> */
    private static function parseEnvFile(string $file): array
    {
        $values = [];
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            $pos = strpos($line, '=');
            if ($pos === false) {
                continue;
            }
            $key = trim(substr($line, 0, $pos));
            $val = trim(substr($line, $pos + 1));
            if ($val !== '' && ($val[0] === '"' || $val[0] === "'")) {
                $val = trim($val, "\"'");
            }
            if ($key !== '') {
                $values[$key] = $val;
            }
        }
        return $values;
    }

    public function get(string $key, ?string $default = null): ?string
    {
        return $this->values[$key] ?? $default;
    }

    public function require(string $key): string
    {
        $v = $this->values[$key] ?? null;
        if ($v === null || $v === '') {
            throw new RuntimeException("Missing required configuration key: {$key}");
        }
        return $v;
    }

    public function has(string $key): bool
    {
        return isset($this->values[$key]) && $this->values[$key] !== '';
    }

    /** Fail-closed bootstrap: everything the app cannot run without. */
    public function assertRuntimeReady(): void
    {
        foreach (['SVGTRACE_DB_DSN', 'SVGTRACE_DB_USER', 'SVGTRACE_DB_PASS', 'SVGTRACE_APP_SECRET'] as $k) {
            $this->require($k);
        }
        if (strlen((string)$this->values['SVGTRACE_APP_SECRET']) < 32) {
            throw new RuntimeException('SVGTRACE_APP_SECRET must be at least 32 characters.');
        }
    }
}
