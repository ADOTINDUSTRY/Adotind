<?php
declare(strict_types=1);

function quote_project_catalog(?PDO $db = null): array
{
    $defaults = require __DIR__ . '/../data/quote-projects.php';
    try {
        if ($db === null) {
            $file = '/var/www/site-tracking/neon-shop.sqlite';
            if (!is_file($file)) return $defaults;
            $db = new PDO('sqlite:' . $file, null, null, [
                PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::SQLITE_ATTR_OPEN_FLAGS=>PDO::SQLITE_OPEN_READONLY,
            ]);
            $db->exec('PRAGMA busy_timeout=1000');
        }
        if (!$db->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='project_picker'")->fetchColumn()) return $defaults;
        $json = $db->query('SELECT catalog FROM project_picker WHERE id=1')->fetchColumn();
        if (!$json) return $defaults;
        $catalog = json_decode($json, true, 8, JSON_THROW_ON_ERROR);
        $projects = [];
        $seen = [];
        foreach (is_array($catalog) ? $catalog : [] as $item) {
            $id = is_array($item) ? ($item['id'] ?? null) : null;
            if (!is_string($id) || !isset($defaults[$id]) || isset($seen[$id]) || !is_string($item['name'] ?? null) || !is_string($item['description'] ?? null)) continue;
            $seen[$id] = true;
            if (($item['enabled'] ?? true) === false) continue;
            $projects[$id] = ['name'=>$item['name'], 'description'=>$item['description']] + $defaults[$id];
        }
        // Existing saved catalogs predate newer categories. Add only genuinely
        // missing defaults; do not re-enable an explicitly disabled entry.
        foreach ($defaults as $id => $default) {
            if (!isset($seen[$id])) $projects[$id] = $default;
        }
        return $projects;
    } catch (Throwable $e) {
        error_log('Quote project settings could not be loaded: ' . get_class($e));
        return $defaults;
    }
}
