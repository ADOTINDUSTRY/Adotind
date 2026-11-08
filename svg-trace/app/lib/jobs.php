<?php
declare(strict_types=1);

/*
 * A Dot SVG Trace — uploads, conversion job queue and worker processing.
 *
 * Queue model: MySQL table st_jobs. Jobs are claimed atomically with a random
 * lock token (UPDATE ... LIMIT 1), have a lease (locked_until), bounded retries
 * and stale-lease recovery. One worker at a time is enforced with flock().
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/settings.php';
require_once __DIR__ . '/engine.php';
require_once __DIR__ . '/prep.php';

/** An error whose message is safe to show to the end user. */
final class StUserError extends RuntimeException
{
    public function __construct(string $message, public readonly int $httpStatus = 422)
    {
        parent::__construct($message);
    }
}

final class StJobs
{
    private const MIME_EXT = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/bmp' => 'bmp',
        'image/x-ms-bmp' => 'bmp',
        'image/webp' => 'webp',
    ];
    private const MAX_PIXELS = 36_000_000;
    private const MAX_SVG_BYTES = 150 * 1024 * 1024;

    // ------------------------------------------------------------------
    // Upload validation
    // ------------------------------------------------------------------

    /**
     * Validate an entry from $_FILES. Reads only the file header for
     * dimensions, so decompression bombs are rejected before decoding.
     *
     * @return array{tmp:string, ext:string, mime:string, width:int, height:int, size:int, name:string, sha256:string}
     */
    public static function validateUpload(?array $file): array
    {
        if ($file === null || !isset($file['error']) || is_array($file['error'])) {
            throw new StUserError('Please choose an image to upload.');
        }
        $maxBytes = self::maxUploadBytes();
        $maxMb = round($maxBytes / 1048576, 1);
        switch ((int)$file['error']) {
            case UPLOAD_ERR_OK:
                break;
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                throw new StUserError("This file is too large. The maximum is {$maxMb} MB.", 413);
            case UPLOAD_ERR_NO_FILE:
                throw new StUserError('Please choose an image to upload.');
            default:
                throw new StUserError('The upload did not complete. Please try again.');
        }
        $tmp = (string)$file['tmp_name'];
        if (!is_uploaded_file($tmp) && PHP_SAPI !== 'cli') {
            throw new StUserError('The upload did not complete. Please try again.');
        }
        $size = (int)filesize($tmp);
        if ($size <= 0) {
            throw new StUserError('The file is empty.');
        }
        if ($size > $maxBytes) {
            throw new StUserError("This file is too large. The maximum is {$maxMb} MB.", 413);
        }

        $mime = (string)(new finfo(FILEINFO_MIME_TYPE))->file($tmp);
        $allowedExt = array_map('strtolower', (array)(StSettings::get('upload')['allowed_formats'] ?? []));
        $ext = self::MIME_EXT[$mime] ?? null;
        if ($ext === null || !in_array($ext, $allowedExt, true)) {
            throw new StUserError('Unsupported file type. Please upload a PNG, JPG, BMP or WEBP image.', 415);
        }
        $info = @getimagesize($tmp);
        if ($info === false || (int)$info[0] < 1 || (int)$info[1] < 1) {
            throw new StUserError('This image could not be read. It may be damaged.');
        }
        [$w, $h] = [(int)$info[0], (int)$info[1]];
        $maxDim = StSettings::int('upload', 'max_dimension_px');
        if ($w > $maxDim || $h > $maxDim || $w * $h > self::MAX_PIXELS) {
            throw new StUserError("This image is {$w}×{$h} px. The maximum is {$maxDim} px on each side.", 413);
        }

        $name = basename(str_replace('\\', '/', (string)($file['name'] ?? 'image')));
        $name = preg_replace('/[\x00-\x1f\x7f]+/u', '', $name) ?? 'image';
        $name = mb_substr(trim($name), 0, 200) ?: 'image';

        return ['tmp' => $tmp, 'ext' => $ext, 'mime' => $mime, 'width' => $w, 'height' => $h,
                'size' => $size, 'name' => $name, 'sha256' => (string)hash_file('sha256', $tmp)];
    }

    /** Smallest of the admin setting and PHP's own upload limits. */
    public static function maxUploadBytes(): int
    {
        $toBytes = static function (string $v): int {
            $v = trim($v);
            $n = (int)$v;
            return match (strtolower(substr($v, -1))) {
                'g' => $n * 1073741824, 'm' => $n * 1048576, 'k' => $n * 1024, default => $n,
            };
        };
        $limits = array_filter([
            StSettings::int('upload', 'max_bytes'),
            $toBytes((string)ini_get('upload_max_filesize')),
            $toBytes((string)ini_get('post_max_size')),
        ], static fn(int $b): bool => $b > 0);
        return $limits === [] ? 0 : min($limits);
    }

    // ------------------------------------------------------------------
    // Enqueue
    // ------------------------------------------------------------------

    /**
     * Create a conversion job from a new upload or an existing original file.
     *
     * @param array<string,mixed> $rawSettings
     * @return array{job_id:int, duplicate:bool}
     */
    public static function enqueue(int $userId, ?array $upload, ?int $sourceFileId, array $rawSettings): array
    {
        $settings = StEngine::normaliseSettings($rawSettings);
        $storedNew = null;
        try {
            $result = StDb::tx(function () use ($userId, $upload, $sourceFileId, $settings, &$storedNew): array {
                // Serialise all enqueues of one user so limits cannot be raced.
                StDb::one('SELECT id FROM st_users WHERE id = ? FOR UPDATE', [$userId]);

                $input = null;
                if ($upload !== null) {
                    $input = StDb::one(
                        "SELECT * FROM st_files WHERE user_id = ? AND kind = 'original' AND sha256 = ?
                            AND deleted_at IS NULL AND expires_at > UTC_TIMESTAMP() ORDER BY id DESC LIMIT 1",
                        [$userId, $upload['sha256']]
                    );
                } elseif ($sourceFileId !== null) {
                    $input = StDb::one(
                        "SELECT * FROM st_files WHERE id = ? AND user_id = ? AND kind = 'original'
                            AND deleted_at IS NULL AND expires_at > UTC_TIMESTAMP()",
                        [$sourceFileId, $userId]
                    );
                    if ($input === null) {
                        throw new StUserError('That image is no longer available. Please upload it again.', 404);
                    }
                } else {
                    throw new StUserError('Please choose an image to upload.');
                }

                if ($input !== null) {
                    $dup = self::findDuplicate($userId, (string)$input['sha256'], $settings);
                    if ($dup !== null) {
                        return ['job_id' => $dup, 'duplicate' => true];
                    }
                }

                $active = StDb::one(
                    "SELECT COUNT(*) AS n FROM st_jobs WHERE user_id = ? AND status IN ('queued','processing')",
                    [$userId]
                );
                if ((int)$active['n'] >= max(1, StSettings::int('limits', 'concurrent_jobs'))) {
                    throw new StUserError('Please wait for your current conversion to finish.', 429);
                }
                // Re-tracing an image already converted (settings tweaks) has its own, larger allowance.
                $isRetrace = $input !== null && StDb::one(
                    'SELECT id FROM st_jobs WHERE user_id = ? AND input_file_id = ? LIMIT 1',
                    [$userId, $input['id']]
                ) !== null;
                if ($isRetrace) {
                    $retraces = StDb::one(
                        'SELECT COUNT(*) AS n FROM st_jobs j WHERE j.user_id = ? AND j.created_at >= UTC_DATE()
                            AND EXISTS (SELECT 1 FROM st_jobs p WHERE p.input_file_id = j.input_file_id AND p.id < j.id)',
                        [$userId]
                    );
                    $retraceLimit = StSettings::int('limits', 'daily_retraces');
                    if ((int)$retraces['n'] >= $retraceLimit) {
                        throw new StUserError("You have reached today's limit of {$retraceLimit} re-traces. It resets at midnight UTC.", 429);
                    }
                } else {
                    $today = StDb::one(
                        'SELECT conversions FROM st_user_daily_usage WHERE user_id = ? AND day = UTC_DATE()',
                        [$userId]
                    );
                    $dailyLimit = StSettings::int('limits', 'daily_conversions');
                    if ((int)($today['conversions'] ?? 0) >= $dailyLimit) {
                        throw new StUserError("You have reached today's limit of {$dailyLimit} new images. It resets at midnight UTC.", 429);
                    }
                }

                $retentionDays = max(1, StSettings::int('retention', 'days'));
                if ($input === null) {
                    $quota = StSettings::int('limits', 'storage_mb_per_user') * 1048576;
                    if (StStorage::userUsageBytes($userId) + (int)$upload['size'] > $quota) {
                        throw new StUserError('Your storage is full. Delete some files in "My files" and try again.', 413);
                    }
                    $title = mb_substr(pathinfo((string)$upload['name'], PATHINFO_FILENAME) ?: 'Untitled project', 0, 190);
                    $projectId = StDb::insert(
                        'INSERT INTO st_projects (user_id, title, created_at, updated_at)
                         VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
                        [$userId, $title]
                    );
                    [$storedName, , $size, $sha] = StStorage::store('originals', (string)$upload['tmp'], (string)$upload['ext']);
                    $storedNew = $storedName;
                    $fileId = StDb::insert(
                        "INSERT INTO st_files (user_id, project_id, kind, format, stored_name, original_name,
                                size_bytes, width, height, sha256, expires_at, created_at)
                         VALUES (?, ?, 'original', ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP() + INTERVAL ? DAY, UTC_TIMESTAMP())",
                        [$userId, $projectId, $upload['ext'], $storedName, $upload['name'], $size,
                         $upload['width'], $upload['height'], $sha, $retentionDays]
                    );
                    $input = ['id' => $fileId, 'project_id' => $projectId, 'sha256' => $sha, 'size_bytes' => $size];
                    StDb::run(
                        'INSERT INTO st_user_daily_usage (user_id, day, uploads_bytes) VALUES (?, UTC_DATE(), ?)
                         ON DUPLICATE KEY UPDATE uploads_bytes = uploads_bytes + VALUES(uploads_bytes)',
                        [$userId, $size]
                    );
                }

                $jobId = StDb::insert(
                    "INSERT INTO st_jobs (user_id, project_id, input_file_id, engine, settings_json, input_sha256,
                            status, queued_at, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, 'queued', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())",
                    [$userId, $input['project_id'], $input['id'], StEngine::engineName($settings),
                     json_encode($settings), $input['sha256']]
                );
                if (!$isRetrace) {
                    StDb::run(
                        'INSERT INTO st_user_daily_usage (user_id, day, conversions) VALUES (?, UTC_DATE(), 1)
                         ON DUPLICATE KEY UPDATE conversions = conversions + 1',
                        [$userId]
                    );
                }
                StDb::run('UPDATE st_projects SET updated_at = UTC_TIMESTAMP() WHERE id = ?', [$input['project_id']]);
                return ['job_id' => $jobId, 'duplicate' => false];
            });
        } catch (Throwable $e) {
            if ($storedNew !== null) {
                StStorage::delete('originals', $storedNew);
            }
            throw $e;
        }
        if ($upload !== null && $storedNew === null && is_file((string)$upload['tmp'])) {
            @unlink((string)$upload['tmp']); // identical image already stored; discard the copy
        }
        return $result;
    }

    /** Same user + same image + same settings, still queued/running or completed with a live output. */
    private static function findDuplicate(int $userId, string $sha, array $settings): ?int
    {
        $rows = StDb::all(
            "SELECT j.id, j.status, j.settings_json, f.deleted_at AS out_deleted
               FROM st_jobs j LEFT JOIN st_files f ON f.id = j.output_file_id
              WHERE j.user_id = ? AND j.input_sha256 = ? AND j.status IN ('queued','processing','completed')
              ORDER BY j.id DESC LIMIT 50",
            [$userId, $sha]
        );
        foreach ($rows as $r) {
            $s = json_decode((string)$r['settings_json'], true);
            if (!is_array($s)) {
                continue;
            }
            ksort($s);
            if ($s == $settings && ($r['status'] !== 'completed' || $r['out_deleted'] === null)) {
                return (int)$r['id'];
            }
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Read models
    // ------------------------------------------------------------------

    /** Job as JSON-safe array for its owner, or null when not found / not owned. */
    public static function publicJob(int $jobId, int $userId): ?array
    {
        $j = StDb::one(
            'SELECT j.*, i.original_name, i.width, i.height, i.size_bytes AS in_size, i.format AS in_format,
                    o.size_bytes AS out_size, o.deleted_at AS out_deleted
               FROM st_jobs j
               JOIN st_files i ON i.id = j.input_file_id
               LEFT JOIN st_files o ON o.id = j.output_file_id
              WHERE j.id = ? AND j.user_id = ?',
            [$jobId, $userId]
        );
        if ($j === null) {
            return null;
        }
        $base = '/svg-trace';
        $ahead = null;
        if ($j['status'] === 'queued') {
            $ahead = (int)(StDb::one(
                "SELECT COUNT(*) AS n FROM st_jobs WHERE status IN ('queued','processing') AND id < ?",
                [$jobId]
            )['n'] ?? 0);
        }
        $out = null;
        if ($j['status'] === 'completed' && $j['output_file_id'] !== null && $j['out_deleted'] === null) {
            $oid = (int)$j['output_file_id'];
            $out = ['file_id' => $oid, 'size_bytes' => (int)$j['out_size'],
                    'view_url' => "{$base}/files/{$oid}/view", 'download_url' => "{$base}/files/{$oid}/download"];
        }
        $iid = (int)$j['input_file_id'];
        return [
            'id' => (int)$j['id'],
            'status' => (string)$j['status'],
            'queue_position' => $ahead,
            'error' => $j['status'] === 'failed' ? (string)$j['error_message'] : null,
            'duration_ms' => $j['duration_ms'] !== null ? (int)$j['duration_ms'] : null,
            'settings' => json_decode((string)$j['settings_json'], true),
            'input' => ['file_id' => $iid, 'name' => (string)$j['original_name'], 'width' => (int)$j['width'],
                        'height' => (int)$j['height'], 'size_bytes' => (int)$j['in_size'],
                        'view_url' => "{$base}/files/{$iid}/view"],
            'output' => $out,
        ];
    }

    /** @return list<array<string,mixed>> */
    public static function recentForUser(int $userId, int $limit = 20): array
    {
        return StDb::all(
            'SELECT j.id, j.status, j.created_at, j.duration_ms, j.output_file_id, j.engine,
                    i.original_name, i.width, i.height, i.expires_at, o.size_bytes AS out_size
               FROM st_jobs j
               JOIN st_files i ON i.id = j.input_file_id
               LEFT JOIN st_files o ON o.id = j.output_file_id AND o.deleted_at IS NULL
              WHERE j.user_id = ? AND i.deleted_at IS NULL
              ORDER BY j.id DESC LIMIT ' . max(1, min(100, $limit)),
            [$userId]
        );
    }

    // ------------------------------------------------------------------
    // Worker side
    // ------------------------------------------------------------------

    public static function lockPath(): string
    {
        StStorage::ensureLayout();
        return StStorage::root() . '/worker.lock';
    }

    /** Re-queue (or fail) jobs whose worker lease expired. */
    public static function recoverStale(): int
    {
        return StDb::run(
            "UPDATE st_jobs
                SET error_message = IF(attempts < max_attempts, NULL, 'The conversion stopped unexpectedly. Please try again.'),
                    finished_at = IF(attempts < max_attempts, NULL, UTC_TIMESTAMP()),
                    status = IF(attempts < max_attempts, 'queued', 'failed'),
                    lock_token = NULL, locked_until = NULL, updated_at = UTC_TIMESTAMP()
              WHERE status = 'processing' AND locked_until < UTC_TIMESTAMP()"
        );
    }

    /** Atomically claim the next queued job. */
    public static function claim(int $leaseSeconds): ?array
    {
        $token = bin2hex(random_bytes(32));
        $n = StDb::run(
            "UPDATE st_jobs
                SET status = 'processing', lock_token = ?, locked_until = UTC_TIMESTAMP() + INTERVAL ? SECOND,
                    attempts = attempts + 1, started_at = COALESCE(started_at, UTC_TIMESTAMP()), updated_at = UTC_TIMESTAMP()
              WHERE status = 'queued'
              ORDER BY priority DESC, id ASC LIMIT 1",
            [$token, $leaseSeconds]
        );
        return $n === 1 ? StDb::one('SELECT * FROM st_jobs WHERE lock_token = ?', [$token]) : null;
    }

    /**
     * Process queued jobs until the queue is empty or the time budget is spent.
     * Caller must hold the worker lock.
     */
    public static function drain(StConfig $config, int $budgetSeconds, ?callable $log = null): int
    {
        $log ??= static function (string $m): void {};
        $timeout = max(10, StSettings::int('worker', 'job_timeout_seconds'));
        $memMb = max(128, StSettings::int('worker', 'memory_limit_mb'));
        $start = time();
        $done = 0;
        $recovered = self::recoverStale();
        if ($recovered > 0) {
            $log("recovered {$recovered} stale job(s)");
        }
        while (time() - $start < $budgetSeconds) {
            $job = self::claim($timeout + 60);
            if ($job === null) {
                break;
            }
            $log("job {$job['id']} claimed (attempt {$job['attempts']})");
            self::process($job, $config, $timeout, $memMb, $log);
            $done++;
        }
        return $done;
    }

    private static function process(array $job, StConfig $config, int $timeout, int $memMb, callable $log): void
    {
        $tmpPng = null;
        $tmpSvg = null;
        $startedNs = hrtime(true);
        try {
            $input = StDb::one('SELECT * FROM st_files WHERE id = ? AND deleted_at IS NULL', [$job['input_file_id']]);
            if ($input === null) {
                self::fail($job, 'The original image was deleted before it could be converted.', false);
                return;
            }
            if (!StEngine::isInstalled($config)) {
                self::fail($job, 'The tracing engine is temporarily unavailable. Please try again later.', false);
                $log('engine not installed at ' . StEngine::vtracerPath($config));
                return;
            }
            $settings = StEngine::normaliseSettings((array)json_decode((string)$job['settings_json'], true));
            $src = StStorage::pathFor('originals', (string)$input['stored_name']);

            StStorage::ensureLayout();
            $tmpPng = StStorage::pathFor('temporary', StStorage::newStoredName('png'));
            $tmpSvg = StStorage::pathFor('temporary', StStorage::newStoredName('svg'));
            $prep = StPrep::prepare($src, $tmpPng, $settings);
            if ($prep === null) {
                self::fail($job, 'This image could not be read. Please upload a valid PNG, JPG, BMP or WEBP file.', false);
                return;
            }
            // Speckle size is chosen in original pixels and the tracer sees the scaled
            // image. Palette snapping already removes noise, so scale by half to keep
            // small details such as the holes in letters.
            $engineSettings = $settings;
            $engineSettings['filter_speckle'] = StPrep::speckle((int)$settings['filter_speckle'], (float)$prep['scale']);
            $output = $settings['output'] ?? 'fill';
            // Outlines of stacked shapes would show edges hidden underneath others.
            if ($prep['cutout'] || $output === 'outline') {
                $engineSettings['hierarchical'] = 'cutout';
            }

            if ($output === 'centerline') {
                $t0 = hrtime(true);
                $cl = StLines::centreline($tmpPng, $prep['key'], $engineSettings);
                $r = ['ok' => $cl !== null, 'exit_code' => $cl !== null ? 0 : 1, 'timed_out' => false,
                      'ms' => (int)((hrtime(true) - $t0) / 1e6), 'log' => $cl !== null ? $cl['paths'] . ' lines' : 'centre-line tracing failed'];
                if ($cl !== null) {
                    file_put_contents($tmpSvg, $cl['svg']);
                }
            } else {
                $r = StEngine::run($tmpPng, $tmpSvg, $engineSettings, $timeout, $memMb, $config);
            }
            $log(sprintf('job %d engine exit=%d timed_out=%s ms=%d %s', $job['id'], $r['exit_code'], $r['timed_out'] ? 'yes' : 'no', $r['ms'], trim(substr($r['log'], 0, 120))));
            $outOfMemory = str_contains($r['log'], 'memory allocation') || str_contains($r['log'], 'out of memory');
            if ($r['timed_out'] || $outOfMemory) {
                self::fail($job, 'This image is too complex to trace within the server limits. Try the "Logo" or '
                    . '"Black & white" preset, raise "Remove specks", lower "Colour detail", or upload a smaller image.', false);
                return;
            }
            if (!$r['ok']) {
                error_log('[svg-trace] engine failure job ' . $job['id'] . ': ' . trim($r['log']));
                self::fail($job, 'The conversion failed. Please try different settings.', true);
                return;
            }
            if (filesize($tmpSvg) > self::MAX_SVG_BYTES) {
                self::fail($job, 'The result is too large. Try fewer colours or a higher "Remove specks" value.', false);
                return;
            }
            $raw = (string)file_get_contents($tmpSvg);
            if ($prep['key'] !== null && $output !== 'centerline') {
                $raw = StPrep::removeKey($raw, $prep['key']);
            }
            if ($output === 'outline') {
                $raw = StLines::outline($raw, max($prep['width'], $prep['height']) / 400);
            }
            $svg = self::finaliseSvg($raw, $prep['width'], $prep['height'], $prep['source_width'], $prep['source_height']);
            if ($svg === null) {
                self::fail($job, 'The conversion produced an invalid file. Please try different settings.', true);
                return;
            }
            file_put_contents($tmpSvg, $svg);
            [$storedName, , $size, $sha] = StStorage::store('outputs', $tmpSvg, 'svg');
            $tmpSvg = null;
            $ms = (int)((hrtime(true) - $startedNs) / 1e6);

            $completed = StDb::tx(function () use ($job, $input, $storedName, $size, $sha, $ms, $r): bool {
                $fileId = StDb::insert(
                    "INSERT INTO st_files (user_id, project_id, kind, format, stored_name, original_name,
                            size_bytes, width, height, sha256, expires_at, created_at)
                     VALUES (?, ?, 'output', 'svg', ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())",
                    [$job['user_id'], $job['project_id'], $storedName,
                     (pathinfo((string)$input['original_name'], PATHINFO_FILENAME) ?: 'trace') . '.svg',
                     $size, $input['width'], $input['height'], $sha, $input['expires_at']]
                );
                $n = StDb::run(
                    "UPDATE st_jobs SET status = 'completed', output_file_id = ?, error_message = NULL,
                            finished_at = UTC_TIMESTAMP(), duration_ms = ?, lock_token = NULL, locked_until = NULL,
                            updated_at = UTC_TIMESTAMP()
                      WHERE id = ? AND lock_token = ?",
                    [$fileId, $ms, $job['id'], $job['lock_token']]
                );
                if ($n !== 1) {
                    throw new RuntimeException('lease lost');
                }
                StDb::run(
                    'INSERT INTO st_user_daily_usage (user_id, day, cpu_ms) VALUES (?, UTC_DATE(), ?)
                     ON DUPLICATE KEY UPDATE cpu_ms = cpu_ms + VALUES(cpu_ms)',
                    [$job['user_id'], $r['ms']]
                );
                StDb::run(
                    "INSERT INTO st_usage_events (user_id, event, meta_json, created_at)
                     VALUES (?, 'conversion_completed', ?, UTC_TIMESTAMP())",
                    [$job['user_id'], json_encode(['job_id' => (int)$job['id'], 'ms' => $ms, 'engine' => $job['engine']])]
                );
                return true;
            });
            if (!$completed) {
                StStorage::delete('outputs', $storedName);
            }
        } catch (Throwable $e) {
            error_log('[svg-trace] worker error job ' . $job['id'] . ': ' . $e->getMessage());
            if (isset($storedName)) {
                StStorage::delete('outputs', $storedName); // its DB row was rolled back
            }
            if ($e->getMessage() === 'lease lost') {
                return;
            }
            self::fail($job, 'The conversion failed unexpectedly. Please try again.', true);
        } finally {
            foreach ([$tmpPng, $tmpSvg] as $t) {
                if (is_string($t) && is_file($t)) {
                    @unlink($t);
                }
            }
        }
    }

    private static function fail(array $job, string $message, bool $retryable): void
    {
        $retry = $retryable && (int)$job['attempts'] < (int)$job['max_attempts'];
        StDb::run(
            'UPDATE st_jobs SET status = ?, error_message = ?, finished_at = ?, lock_token = NULL, locked_until = NULL,
                    updated_at = UTC_TIMESTAMP()
              WHERE id = ? AND lock_token = ?',
            [$retry ? 'queued' : 'failed', $retry ? null : $message, $retry ? null : StDb::utcNow(),
             $job['id'], $job['lock_token']]
        );
        if (!$retry) {
            StDb::run(
                "INSERT INTO st_usage_events (user_id, event, meta_json, created_at)
                 VALUES (?, 'conversion_failed', ?, UTC_TIMESTAMP())",
                [$job['user_id'], json_encode(['job_id' => (int)$job['id']])]
            );
        }
    }

    /** Decode any supported raster with GD, apply EXIF orientation, write a clean PNG (no metadata). */
    /**
     * Sanitise engine output and make it scalable: the viewBox keeps the
     * traced (working) coordinates, width/height restore the original size.
     */
    private static function finaliseSvg(string $svg, int $traceW, int $traceH, int $outW, int $outH): ?string
    {
        $clean = StSecurity::sanitiseSvg($svg, true);
        if ($clean === null) {
            return null;
        }
        if ($traceW > 0 && $traceH > 0) {
            $clean = preg_replace_callback('/<svg\b[^>]*>/i', static function (array $m) use ($traceW, $traceH, $outW, $outH): string {
                $tag = preg_replace('/\s(?:width|height|viewBox)="[^"]*"/i', '', $m[0]) ?? $m[0];
                return preg_replace('/^<svg\b/i', sprintf('<svg width="%d" height="%d" viewBox="0 0 %d %d"', $outW, $outH, $traceW, $traceH), $tag) ?? $tag;
            }, $clean, 1) ?? $clean;
        }
        return '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
            . '<!-- Created with A Dot SVG Trace (adotind.com/svg-trace) -->' . "\n" . $clean . "\n";
    }

    /**
     * Start a background worker if none is running (best effort). Cron remains
     * the safety net. File descriptors are closed so the HTTP response is not
     * held open by the child process.
     */
    public static function kickWorker(StConfig $config): void
    {
        try {
            $lock = @fopen(self::lockPath(), 'c');
            if ($lock === false) {
                return;
            }
            $free = flock($lock, LOCK_EX | LOCK_NB);
            if ($free) {
                flock($lock, LOCK_UN);
            }
            fclose($lock);
            if (!$free) {
                return; // a worker is already running and will pick the job up
            }
            $php = self::phpCli($config);
            $shell = is_executable('/bin/bash') ? '/bin/bash' : null;
            if ($php === null || $shell === null || !function_exists('proc_open')) {
                return;
            }
            $script = 'for fd in /proc/$$/fd/*; do fd=${fd##*/}; case $fd in 0|1|2) ;; *) eval "exec $fd>&-" 2>/dev/null;; esac; done; '
                . 'if command -v setsid >/dev/null 2>&1; then setsid "$0" "$1" --drain </dev/null >/dev/null 2>&1 & '
                . 'else nohup "$0" "$1" --drain </dev/null >/dev/null 2>&1 & fi';
            $proc = proc_open(
                [$shell, '-c', $script, $php, dirname(__DIR__, 2) . '/bin/worker.php'],
                [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']],
                $pipes
            );
            if (is_resource($proc)) {
                proc_close($proc);
            }
        } catch (Throwable $e) {
            error_log('[svg-trace] kickWorker: ' . $e->getMessage());
        }
    }

    public static function phpCli(StConfig $config): ?string
    {
        $candidates = array_filter([
            $config->get('SVGTRACE_PHP_CLI'),
            PHP_SAPI === 'cli' ? PHP_BINARY : null,
            PHP_BINDIR . '/php',
            '/usr/bin/php',
        ]);
        foreach ($candidates as $c) {
            if (is_string($c) && is_file($c) && is_executable($c)) {
                return $c;
            }
        }
        return null;
    }
}
