<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') exit(1);
require __DIR__ . '/../config/site.php';
require __DIR__ . '/../lib/quote_system.php';
require __DIR__ . '/../lib/website_storage.php';

// Running with two directory arguments imports a restored copy for verification.
if ($argc !== 1 && $argc !== 3) throw new InvalidArgumentException('Expected media and tracking directories together.');
$media = $argv[1] ?? dirname($siteConfig['quote_db_file']);
$tracking = $argv[2] ?? '/var/www/site-tracking';
$siteConfig['quote_db_file'] = $media . '/quote-system.sqlite';
$dest = $tracking . '/tracking.sqlite';
$lock = fopen($tracking . '/website-storage.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Could not lock website storage');
if (is_file($dest)) {
    echo "Database storage is already active.\n";
    exit;
}
function read_document(string $path): array
{
    $data = file_get_contents($path);
    if ($data === false) throw new RuntimeException('Cannot read ' . basename($path));
    $value = json_decode($data, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($value)) throw new RuntimeException('Expected structured data in ' . basename($path));
    return $value;
}
function each_record(string $file): Generator
{
    $handle = fopen($file, 'rb');
    if (!$handle) throw new RuntimeException('Cannot read ' . basename($file));
    try {
        while (($position = ftell($handle)) !== false && ($line = fgets($handle)) !== false) {
            if (trim($line) !== '') yield $position => json_decode($line, true, 512, JSON_THROW_ON_ERROR);
        }
        if (!feof($handle)) throw new RuntimeException('Incomplete read');
    } finally { fclose($handle); }
}
$tmp = tempnam($tracking, '.tracking-import-');
if ($tmp === false) throw new RuntimeException('Cannot create tracking database');
try {
    $db = new PDO('sqlite:' . $tmp, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $db->beginTransaction();
    $db->exec('CREATE TABLE events(id INTEGER PRIMARY KEY,day TEXT NOT NULL,payload TEXT NOT NULL);
        CREATE INDEX events_by_day ON events(day,id);
        CREATE TABLE event_bytes(day TEXT PRIMARY KEY,total INTEGER NOT NULL);
        CREATE TABLE daily_documents(day TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(day,kind));
        CREATE TABLE operations(day TEXT NOT NULL,audience TEXT NOT NULL,metric TEXT NOT NULL,total INTEGER NOT NULL,PRIMARY KEY(day,audience,metric));');
    $insertEvent = $db->prepare('INSERT INTO events(day,payload) VALUES (?,?)');
    $insertOperation = $db->prepare('INSERT INTO operations VALUES (?,?,?,?)');
    $insertDoc = $db->prepare('INSERT INTO daily_documents VALUES (?,?,?)');
    $events = $operations = $documents = 0;
    foreach (new DirectoryIterator($tracking) as $item) {
        if (!$item->isFile()) continue;
        $name = $item->getFilename();
        $path = $item->getPathname();
        if (preg_match('/^(\d{4}-\d{2}-\d{2})\.jsonl$/D', $name, $m)) {
            foreach (each_record($path) as $row) {
                $insertEvent->execute([$m[1],json_encode($row, JSON_THROW_ON_ERROR)]);
                $events++;
            }
            $db->prepare('INSERT INTO event_bytes VALUES (?,?)')->execute([$m[1],$item->getSize()]);
        } elseif (preg_match('/^operations-(\d{4}-\d{2}-\d{2})\.json$/D', $name, $m)) {
            foreach (read_document($path) as $audience => $totals) {
                foreach ($totals as $metric => $count) {
                    if (!is_int($count) || $count < 0) throw new RuntimeException('Invalid daily count');
                    $insertOperation->execute([$m[1],$audience,$metric,$count]);
                    $operations += $count;
                }
            }
        } elseif (preg_match('/^(consent-browsers|consent)-(\d{4}-\d{2}-\d{2})\.json$/D', $name, $m)) {
            read_document($path);
            $insertDoc->execute([$m[2],$m[1] === 'consent' ? 'legacy_consent' : 'consent',file_get_contents($path)]);
            $documents++;
        }
    }
    if ((int)$db->query('SELECT COUNT(*) FROM events')->fetchColumn() !== $events ||
        (int)$db->query('SELECT SUM(total) FROM operations')->fetchColumn() !== $operations ||
        (int)$db->query('SELECT COUNT(*) FROM daily_documents')->fetchColumn() !== $documents) {
        throw new RuntimeException('Tracking totals differ');
    }
    $db->commit();
    if ($db->query('PRAGMA integrity_check')->fetchColumn() !== 'ok') throw new RuntimeException('Tracking integrity check failed');

    $business = quote_db($siteConfig);
    $business->beginTransaction();
    try {
        foreach (['media'=>'library.json','settings'=>'settings.json'] as $key => $file) {
            $value = is_file($media . '/' . $file) ? read_document($media . '/' . $file) : [];
            website_save_metadata($siteConfig, $key, $value);
            if (website_metadata($siteConfig, $key) !== $value) throw new RuntimeException('Metadata mismatch');
        }
        $messages = 0;
        foreach (['inquiry'=>'inquiries.log','quote_update'=>'quote-updates.log'] as $kind => $name) {
            $path = $media . '/inquiries/' . $name;
            if (!is_file($path)) continue;
            foreach (each_record($path) as $offset => $entry) {
                website_save_message($business, $kind, $entry, $name . ':' . $offset);
                $messages++;
            }
        }
        if ((int)$business->query('SELECT COUNT(*) FROM website_inbox WHERE legacy_key IS NOT NULL')->fetchColumn() !== $messages)
            throw new RuntimeException('Inquiry count mismatch');
        $business->commit();
    } catch (Throwable $e) {
        if ($business->inTransaction()) $business->rollBack();
        throw $e;
    }
    if ($business->query('PRAGMA integrity_check')->fetchColumn() !== 'ok') throw new RuntimeException('Business integrity check failed');
    if (!chmod($tmp, 0640) || !rename($tmp, $dest)) throw new RuntimeException('Cannot activate database');
    echo "Verified and imported $events events, $operations counter increments, $documents consent records and $messages messages.\n";
} finally {
    if (is_file($tmp)) unlink($tmp);
    fclose($lock);
}
