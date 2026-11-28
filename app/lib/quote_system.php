<?php
declare(strict_types=1);
require_once __DIR__ . '/quote_dxf_bounds.php';
require_once __DIR__ . '/public_project_picker.php';

function quote_db_path(array $siteConfig): string
{
    $configured = (string)($siteConfig['quote_db_file'] ?? '');
    if ($configured !== '') {
        return $configured;
    }
    $root = dirname((string)($siteConfig['inquiries_dir'] ?? (__DIR__ . '/../../storage/inquiries')));
    return rtrim($root, '/') . '/quote-system.sqlite';
}

function quote_migrate_safety_columns(PDO $db): void
{
    // The ERP can initialize these same columns first. Keep migration
    // additive and never infer approval from the pre-existing rate entries.
    $machineColumns = array_column($db->query('PRAGMA table_info(quote_machines)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    $rateColumns = array_column($db->query('PRAGMA table_info(quote_machine_materials)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!in_array('bed_width_mm', $machineColumns, true)) $db->exec('ALTER TABLE quote_machines ADD COLUMN bed_width_mm REAL DEFAULT NULL');
    if (!in_array('bed_height_mm', $machineColumns, true)) $db->exec('ALTER TABLE quote_machines ADD COLUMN bed_height_mm REAL DEFAULT NULL');
    if (!in_array('shop_reviewed', $rateColumns, true)) $db->exec('ALTER TABLE quote_machine_materials ADD COLUMN shop_reviewed INTEGER NOT NULL DEFAULT 0');
}

function quote_db(array $siteConfig): PDO
{
    static $pdo = null;
    static $lastPath = null;
    $path = quote_db_path($siteConfig);
    if ($pdo instanceof PDO && $lastPath === $path) {
        return $pdo;
    }

    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $pdo = new PDO('sqlite:' . $path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');
    // Schema/seed only once per database file; user_version marks completion.
    if ((int)$pdo->query('PRAGMA user_version')->fetchColumn() < 4) {
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $version = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
            if ($version < 1) {
                quote_install_schema($pdo);
                quote_seed_defaults($pdo);
            }
            if ($version < 2) {
                $pdo->exec("CREATE TABLE quote_estimates (
                    id INTEGER PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    snapshot TEXT NOT NULL, order_id INTEGER UNIQUE REFERENCES quote_orders(id)
                );
                INSERT INTO quote_estimates(created_at,snapshot,order_id)
                    SELECT created_at,estimate_payload_json,id FROM quote_orders ORDER BY id;
                CREATE TABLE website_inbox (
                    id INTEGER PRIMARY KEY, kind TEXT NOT NULL, submitted_at TEXT NOT NULL,
                    payload TEXT NOT NULL, legacy_key TEXT UNIQUE
                );
                CREATE TABLE website_metadata (name TEXT PRIMARY KEY, payload TEXT NOT NULL);
                PRAGMA user_version=2");
            }
            if ($version < 3) {
                $pdo->exec('ALTER TABLE quote_estimates ADD COLUMN booking_key TEXT;
                    CREATE UNIQUE INDEX quote_estimates_booking_key ON quote_estimates(booking_key);
                    PRAGMA user_version=3');
            }
            if ($version < 4) {
                quote_migrate_safety_columns($pdo);
                $pdo->exec('PRAGMA user_version=4');
            }
            $pdo->exec('COMMIT');
        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK');
            throw $e;
        }
    }
    $lastPath = $path;
    return $pdo;
}

function quote_install_schema(PDO $db): void
{
    $db->exec("
        CREATE TABLE IF NOT EXISTS quote_machines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            setup_minutes REAL NOT NULL DEFAULT 10,
            setup_cost REAL NOT NULL DEFAULT 0,
            hourly_rate REAL NOT NULL DEFAULT 75,
            min_charge REAL NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )");

    $db->exec("
        CREATE TABLE IF NOT EXISTS quote_materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sheet_width_mm REAL NOT NULL,
            sheet_height_mm REAL NOT NULL,
            sheet_price REAL NOT NULL,
            waste_percent REAL NOT NULL DEFAULT 10,
            active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )");

    $db->exec("
        CREATE TABLE IF NOT EXISTS quote_machine_materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            machine_id INTEGER NOT NULL,
            material_id INTEGER NOT NULL,
            cut_speed_mm_min REAL NOT NULL,
            pierce_time_sec REAL NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(machine_id, material_id),
            FOREIGN KEY(machine_id) REFERENCES quote_machines(id) ON DELETE CASCADE,
            FOREIGN KEY(material_id) REFERENCES quote_materials(id) ON DELETE CASCADE
        )");

    $db->exec("
        CREATE TABLE IF NOT EXISTS quote_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )");

    $db->exec("
        CREATE TABLE IF NOT EXISTS quote_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            status TEXT NOT NULL DEFAULT 'new',
            customer_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            message TEXT NOT NULL DEFAULT '',
            machine_id INTEGER NOT NULL,
            material_id INTEGER NOT NULL,
            part_width_mm REAL NOT NULL,
            part_height_mm REAL NOT NULL,
            quantity INTEGER NOT NULL,
            vector_filename TEXT NOT NULL,
            vector_ext TEXT NOT NULL,
            vector_length_mm REAL,
            estimate_setup_cost REAL NOT NULL,
            estimate_cut_cost REAL NOT NULL,
            estimate_material_cost REAL NOT NULL,
            estimate_vat REAL NOT NULL,
            estimate_total REAL NOT NULL,
            estimate_minutes REAL NOT NULL,
            estimate_payload_json TEXT NOT NULL,
            FOREIGN KEY(machine_id) REFERENCES quote_machines(id) ON DELETE RESTRICT,
            FOREIGN KEY(material_id) REFERENCES quote_materials(id) ON DELETE RESTRICT
        )");
}

function quote_seed_defaults(PDO $db): void
{
    $machineCount = (int)$db->query('SELECT COUNT(*) FROM quote_machines')->fetchColumn();
    if ($machineCount === 0) {
        $rows = [
            ['CO2 Laser', 'co2', 12, 15, 70, 35, 1, 10],
            ['Fiber Laser', 'fiber', 14, 20, 95, 45, 1, 20],
            ['CNC Router', 'cnc', 18, 22, 80, 40, 1, 30],
        ];
        $st = $db->prepare('INSERT INTO quote_machines (name, code, setup_minutes, setup_cost, hourly_rate, min_charge, active, sort_order, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
        foreach ($rows as $r) {
            $st->execute($r);
        }
    }

    $materialCount = (int)$db->query('SELECT COUNT(*) FROM quote_materials')->fetchColumn();
    if ($materialCount === 0) {
        $rows = [
            ['Acrylic 3mm', 2440, 1220, 85, 10, 1, 10],
            ['MDF 6mm', 2440, 1220, 42, 12, 1, 20],
            ['Mild Steel 1.5mm', 3000, 1500, 160, 15, 1, 30],
            ['Stainless 1.5mm', 3000, 1500, 260, 15, 1, 40],
            ['Aluminium 2mm', 3000, 1500, 190, 15, 1, 50],
            ['PVC 5mm', 2440, 1220, 55, 12, 1, 60],
        ];
        $st = $db->prepare('INSERT INTO quote_materials (name, sheet_width_mm, sheet_height_mm, sheet_price, waste_percent, active, sort_order, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
        foreach ($rows as $r) {
            $st->execute($r);
        }
    }

    $rateCount = (int)$db->query('SELECT COUNT(*) FROM quote_machine_materials')->fetchColumn();
    if ($rateCount === 0) {
        $machines = $db->query('SELECT id, code FROM quote_machines')->fetchAll();
        $materials = $db->query('SELECT id, name FROM quote_materials')->fetchAll();
        $speed = static function (string $code, string $name): float {
            $n = strtolower($name);
            return match ($code) {
                'co2' => str_contains($n, 'acrylic') ? 900
                    : (str_contains($n, 'mdf') ? 1200 : (str_contains($n, 'pvc') ? 1100 : 450)),
                'fiber' => str_contains($n, 'steel') ? 1800
                    : (str_contains($n, 'stainless') ? 1300 : (str_contains($n, 'aluminium') ? 1400 : 700)),
                default => str_contains($n, 'mdf') ? 2600
                    : (str_contains($n, 'acrylic') ? 1700 : (str_contains($n, 'pvc') ? 2200 : 900)),
            };
        };
        $st = $db->prepare('INSERT INTO quote_machine_materials (machine_id, material_id, cut_speed_mm_min, pierce_time_sec, active, updated_at)
            VALUES (?, ?, ?, 0, 1, CURRENT_TIMESTAMP)');
        foreach ($machines as $m) {
            foreach ($materials as $mat) {
                $st->execute([(int)$m['id'], (int)$mat['id'], $speed((string)$m['code'], (string)$mat['name'])]);
            }
        }
    }

    $defaults = [
        'currency_symbol' => '€',
        'vat_percent' => '19',
        'markup_percent' => '0',
        'round_to' => '0.5',
        'instant_exts' => 'svg,dxf',
    ];
    $st = $db->prepare('INSERT OR IGNORE INTO quote_settings (key, value) VALUES (?, ?)');
    foreach ($defaults as $k => $v) {
        $st->execute([$k, $v]);
    }
}

function quote_settings(array $siteConfig): array
{
    $db = quote_db($siteConfig);
    $rows = $db->query('SELECT key, value FROM quote_settings')->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $out[(string)$r['key']] = (string)$r['value'];
    }
    return $out;
}

function quote_active_options(array $siteConfig): array
{
    $db = quote_db($siteConfig);
    $machines = $db->query('SELECT * FROM quote_machines WHERE active = 1 ORDER BY sort_order, id')->fetchAll();
    $materials = $db->query('SELECT * FROM quote_materials WHERE active = 1 ORDER BY sort_order, id')->fetchAll();
    $rates = $db->query('SELECT * FROM quote_machine_materials WHERE active = 1')->fetchAll();
    $projectPairs = quote_cutting_project_pairs($machines, $materials, $rates);
    return ['machines' => $machines, 'materials' => $materials, 'rates' => $rates,
        'eligible_pairs' => $projectPairs['drawing'], 'project_pairs' => $projectPairs,
        'settings' => quote_settings($siteConfig)];
}

/** Only the site-owned IDs below can select a cutting process or material family. */
function quote_cutting_projects(): array
{
    return ['drawing', 'fiber', 'co2', 'acrylic', 'metal', 'wood'];
}

/** Classify conservatively: an unrecognized label is never assumed to match. */
function quote_cutting_project_matches(string $project, array $machine, array $material): bool
{
    if (!in_array($project, quote_cutting_projects(), true)) return false;
    $code = strtolower(trim((string)($machine['code'] ?? '')));
    $name = strtolower((string)($material['name'] ?? ''));
    return match ($project) {
        // The customer-facing "Custom CNC Cutting" option must not silently
        // select a laser. Use explicitly named CNC/router codes only.
        'drawing' => (bool)preg_match('/\Acnc(?:[-_](?:router(?:[-_]?[0-9]+)?|[0-9]+))?\z/D', $code),
        'fiber' => $code === 'fiber',
        'co2' => $code === 'co2',
        'acrylic' => (bool)preg_match('/\b(?:acrylic|plexiglass|perspex|pmma)\b/i', $name),
        'metal' => (bool)preg_match('/\b(?:steel|stainless|aluminium|aluminum|metal|iron|copper|brass)\b/i', $name),
        'wood' => (bool)preg_match('/\b(?:wood|wooden|plywood|mdf|timber|birch|oak)\b/i', $name),
        default => false,
    };
}

/** Expose IDs only, after applying the same shop-review and capacity checks as pricing. */
function quote_cutting_project_pairs(array $machines, array $materials, array $rates): array
{
    $pairs = array_fill_keys(quote_cutting_projects(), []);
    $machineMap = []; $materialMap = [];
    foreach ($machines as $machine) if ((int)($machine['active'] ?? 0) === 1) $machineMap[(int)$machine['id']] = $machine;
    foreach ($materials as $material) if ((int)($material['active'] ?? 0) === 1) $materialMap[(int)$material['id']] = $material;
    foreach ($rates as $rate) {
        $machineId = (int)($rate['machine_id'] ?? 0); $materialId = (int)($rate['material_id'] ?? 0);
        if ((int)($rate['active'] ?? 0) !== 1 || !isset($machineMap[$machineId], $materialMap[$materialId])) continue;
        $machine = $machineMap[$machineId]; $material = $materialMap[$materialId];
        try { quote_require_reviewed_capacity($machine, $material, $rate, ['part_width_mm'=>1.0, 'part_height_mm'=>1.0]); }
        catch (DomainException $e) { continue; }
        foreach ($pairs as $project => &$items) {
            if (quote_cutting_project_matches($project, $machine, $material)) $items[] = ['machine_id'=>$machineId, 'material_id'=>$materialId];
        }
        unset($items);
    }
    return $pairs;
}

function quote_dashboard_data(array $siteConfig): array
{
    $db = quote_db($siteConfig);
    return [
        'machines' => $db->query('SELECT * FROM quote_machines ORDER BY sort_order, id')->fetchAll(),
        'materials' => $db->query('SELECT * FROM quote_materials ORDER BY sort_order, id')->fetchAll(),
        'rates' => $db->query('
            SELECT r.*, m.name AS machine_name, m.code AS machine_code, t.name AS material_name
            FROM quote_machine_materials r
            JOIN quote_machines m ON m.id = r.machine_id
            JOIN quote_materials t ON t.id = r.material_id
            ORDER BY m.sort_order, m.id, t.sort_order, t.id
        ')->fetchAll(),
        'settings' => quote_settings($siteConfig),
        'orders' => $db->query('
            SELECT o.*, m.name AS machine_name, t.name AS material_name
            FROM quote_orders o
            JOIN quote_machines m ON m.id = o.machine_id
            JOIN quote_materials t ON t.id = o.material_id
            ORDER BY o.id DESC LIMIT 100
        ')->fetchAll(),
    ];
}

function quote_round(float $value, float $step): float
{
    if ($step <= 0) {
        return round($value, 2);
    }
    return round(round($value / $step) * $step, 2);
}

function quote_extract_svg_length_mm(string $path, array &$warnings): float
{
    $xml = @file_get_contents($path);
    if ($xml === false || trim($xml) === '') {
        throw new RuntimeException('Unable to read SVG file.');
    }
    $doc = new DOMDocument();
    if (!@$doc->loadXML($xml, LIBXML_NONET | LIBXML_NOENT | LIBXML_NOWARNING | LIBXML_NOERROR)) {
        throw new RuntimeException('Invalid SVG format.');
    }
    $svg = $doc->documentElement;
    if (!$svg instanceof DOMElement || strtolower($svg->tagName) !== 'svg') {
        throw new RuntimeException('Invalid SVG root element.');
    }

    $scale = 1.0;
    $viewBox = preg_split('/[\s,]+/', trim((string)$svg->getAttribute('viewBox')));
    $vbW = isset($viewBox[2]) ? (float)$viewBox[2] : 0.0;
    $wAttr = trim((string)$svg->getAttribute('width'));
    if ($vbW > 0 && $wAttr !== '' && preg_match('/^\s*([-+]?\d*\.?\d+)\s*(mm|cm|in)?\s*$/i', $wAttr, $m) === 1) {
        $w = (float)$m[1];
        $u = strtolower((string)($m[2] ?? ''));
        if ($u === 'cm') {
            $w *= 10;
        } elseif ($u === 'in') {
            $w *= 25.4;
        }
        if ($w > 0) {
            $scale = $w / $vbW;
        }
    }

    $length = 0.0;
    $xpath = new DOMXPath($doc);
    $nodes = $xpath->query('//*[local-name()="path" or local-name()="polyline" or local-name()="polygon" or local-name()="line" or local-name()="circle" or local-name()="ellipse" or local-name()="rect"]');
    if ($nodes === false) {
        throw new RuntimeException('Unable to inspect SVG content.');
    }
    /** @var DOMElement $el */
    foreach ($nodes as $el) {
        if ($el->hasAttribute('transform')) {
            $warnings[] = 'Some SVG elements have transform attributes; please flatten transforms for best accuracy.';
        }
        $tag = strtolower($el->localName);
        if ($tag === 'path') {
            $d = (string)$el->getAttribute('d');
            $length += quote_path_length($d);
        } elseif ($tag === 'line') {
            $x1 = (float)$el->getAttribute('x1');
            $y1 = (float)$el->getAttribute('y1');
            $x2 = (float)$el->getAttribute('x2');
            $y2 = (float)$el->getAttribute('y2');
            $length += hypot($x2 - $x1, $y2 - $y1);
        } elseif ($tag === 'circle') {
            $r = (float)$el->getAttribute('r');
            $length += max(0.0, 2 * M_PI * $r);
        } elseif ($tag === 'ellipse') {
            $rx = max(0.0, (float)$el->getAttribute('rx'));
            $ry = max(0.0, (float)$el->getAttribute('ry'));
            if ($rx > 0 && $ry > 0) {
                $h = (($rx - $ry) ** 2) / (($rx + $ry) ** 2);
                $length += M_PI * ($rx + $ry) * (1 + (3 * $h) / (10 + sqrt(4 - 3 * $h)));
            }
        } elseif ($tag === 'rect') {
            $w = max(0.0, (float)$el->getAttribute('width'));
            $h = max(0.0, (float)$el->getAttribute('height'));
            $length += 2 * ($w + $h);
        } else {
            $pts = quote_parse_points((string)$el->getAttribute('points'));
            if (count($pts) >= 2) {
                for ($i = 1; $i < count($pts); $i++) {
                    $length += hypot($pts[$i][0] - $pts[$i - 1][0], $pts[$i][1] - $pts[$i - 1][1]);
                }
                if ($tag === 'polygon') {
                    $length += hypot($pts[0][0] - $pts[count($pts) - 1][0], $pts[0][1] - $pts[count($pts) - 1][1]);
                }
            }
        }
    }
    return $length * $scale;
}

function quote_parse_points(string $points): array
{
    $tokens = preg_split('/[\s,]+/', trim($points));
    $out = [];
    if (!is_array($tokens)) {
        return $out;
    }
    for ($i = 0; $i + 1 < count($tokens); $i += 2) {
        if (!is_numeric($tokens[$i]) || !is_numeric($tokens[$i + 1])) {
            continue;
        }
        $out[] = [(float)$tokens[$i], (float)$tokens[$i + 1]];
    }
    return $out;
}

function quote_path_length(string $d): float
{
    $tokens = [];
    preg_match_all('/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/', $d, $tokens);
    $tokens = $tokens[0] ?? [];
    if ($tokens === []) {
        return 0.0;
    }

    $len = 0.0;
    $i = 0;
    $cmd = '';
    $x = 0.0;
    $y = 0.0;
    $sx = 0.0;
    $sy = 0.0;
    $cx = 0.0;
    $cy = 0.0;
    $qx = 0.0;
    $qy = 0.0;

    $isCmd = static fn(string $t): bool => preg_match('/^[A-Za-z]$/', $t) === 1;
    $num = static fn(string $t): float => (float)$t;

    while ($i < count($tokens)) {
        if ($isCmd($tokens[$i])) {
            $cmd = $tokens[$i++];
        } elseif ($cmd === '') {
            break;
        }
        $up = strtoupper($cmd);
        $rel = $cmd !== $up;

        if ($up === 'Z') {
            $len += hypot($sx - $x, $sy - $y);
            $x = $sx;
            $y = $sy;
            continue;
        }

        if ($up === 'M') {
            if ($i + 1 >= count($tokens)) {
                break;
            }
            $nx = $num($tokens[$i++]);
            $ny = $num($tokens[$i++]);
            if ($rel) {
                $nx += $x;
                $ny += $y;
            }
            $x = $sx = $nx;
            $y = $sy = $ny;
            $cmd = $rel ? 'l' : 'L';
            continue;
        }

        if ($up === 'L') {
            if ($i + 1 >= count($tokens)) {
                break;
            }
            $nx = $num($tokens[$i++]);
            $ny = $num($tokens[$i++]);
            if ($rel) {
                $nx += $x;
                $ny += $y;
            }
            $len += hypot($nx - $x, $ny - $y);
            $x = $nx;
            $y = $ny;
            continue;
        }

        if ($up === 'H') {
            if ($i >= count($tokens)) {
                break;
            }
            $nx = $num($tokens[$i++]);
            if ($rel) {
                $nx += $x;
            }
            $len += abs($nx - $x);
            $x = $nx;
            continue;
        }

        if ($up === 'V') {
            if ($i >= count($tokens)) {
                break;
            }
            $ny = $num($tokens[$i++]);
            if ($rel) {
                $ny += $y;
            }
            $len += abs($ny - $y);
            $y = $ny;
            continue;
        }

        if ($up === 'C') {
            if ($i + 5 >= count($tokens)) {
                break;
            }
            $x1 = $num($tokens[$i++]); $y1 = $num($tokens[$i++]);
            $x2 = $num($tokens[$i++]); $y2 = $num($tokens[$i++]);
            $x3 = $num($tokens[$i++]); $y3 = $num($tokens[$i++]);
            if ($rel) {
                $x1 += $x; $y1 += $y; $x2 += $x; $y2 += $y; $x3 += $x; $y3 += $y;
            }
            $len += quote_cubic_length([$x, $y], [$x1, $y1], [$x2, $y2], [$x3, $y3]);
            $x = $x3; $y = $y3; $cx = $x2; $cy = $y2;
            continue;
        }

        if ($up === 'S') {
            if ($i + 3 >= count($tokens)) {
                break;
            }
            $x2 = $num($tokens[$i++]); $y2 = $num($tokens[$i++]);
            $x3 = $num($tokens[$i++]); $y3 = $num($tokens[$i++]);
            if ($rel) {
                $x2 += $x; $y2 += $y; $x3 += $x; $y3 += $y;
            }
            $x1 = 2 * $x - $cx; $y1 = 2 * $y - $cy;
            $len += quote_cubic_length([$x, $y], [$x1, $y1], [$x2, $y2], [$x3, $y3]);
            $x = $x3; $y = $y3; $cx = $x2; $cy = $y2;
            continue;
        }

        if ($up === 'Q') {
            if ($i + 3 >= count($tokens)) {
                break;
            }
            $x1 = $num($tokens[$i++]); $y1 = $num($tokens[$i++]);
            $x2 = $num($tokens[$i++]); $y2 = $num($tokens[$i++]);
            if ($rel) {
                $x1 += $x; $y1 += $y; $x2 += $x; $y2 += $y;
            }
            $len += quote_quad_length([$x, $y], [$x1, $y1], [$x2, $y2]);
            $x = $x2; $y = $y2; $qx = $x1; $qy = $y1;
            continue;
        }

        if ($up === 'T') {
            if ($i + 1 >= count($tokens)) {
                break;
            }
            $x2 = $num($tokens[$i++]); $y2 = $num($tokens[$i++]);
            if ($rel) {
                $x2 += $x; $y2 += $y;
            }
            $x1 = 2 * $x - $qx; $y1 = 2 * $y - $qy;
            $len += quote_quad_length([$x, $y], [$x1, $y1], [$x2, $y2]);
            $x = $x2; $y = $y2; $qx = $x1; $qy = $y1;
            continue;
        }

        if ($up === 'A') {
            if ($i + 6 >= count($tokens)) {
                break;
            }
            $rx = abs($num($tokens[$i++])); $ry = abs($num($tokens[$i++]));
            $rot = $num($tokens[$i++]);
            $large = (int)$num($tokens[$i++]) !== 0;
            $sweep = (int)$num($tokens[$i++]) !== 0;
            $x2 = $num($tokens[$i++]); $y2 = $num($tokens[$i++]);
            if ($rel) {
                $x2 += $x; $y2 += $y;
            }
            $len += quote_arc_length([$x, $y], $rx, $ry, $rot, $large, $sweep, [$x2, $y2]);
            $x = $x2; $y = $y2;
            continue;
        }

        $i++;
    }
    return $len;
}

function quote_cubic_length(array $p0, array $p1, array $p2, array $p3): float
{
    $len = 0.0;
    $prev = $p0;
    $steps = 40;
    for ($i = 1; $i <= $steps; $i++) {
        $t = $i / $steps;
        $m = 1 - $t;
        $pt = [
            $m ** 3 * $p0[0] + 3 * $m * $m * $t * $p1[0] + 3 * $m * $t * $t * $p2[0] + $t ** 3 * $p3[0],
            $m ** 3 * $p0[1] + 3 * $m * $m * $t * $p1[1] + 3 * $m * $t * $t * $p2[1] + $t ** 3 * $p3[1],
        ];
        $len += hypot($pt[0] - $prev[0], $pt[1] - $prev[1]);
        $prev = $pt;
    }
    return $len;
}

function quote_quad_length(array $p0, array $p1, array $p2): float
{
    $len = 0.0;
    $prev = $p0;
    $steps = 32;
    for ($i = 1; $i <= $steps; $i++) {
        $t = $i / $steps;
        $m = 1 - $t;
        $pt = [
            $m * $m * $p0[0] + 2 * $m * $t * $p1[0] + $t * $t * $p2[0],
            $m * $m * $p0[1] + 2 * $m * $t * $p1[1] + $t * $t * $p2[1],
        ];
        $len += hypot($pt[0] - $prev[0], $pt[1] - $prev[1]);
        $prev = $pt;
    }
    return $len;
}

function quote_arc_length(array $p0, float $rx, float $ry, float $rotDeg, bool $large, bool $sweep, array $p1): float
{
    if ($rx <= 0 || $ry <= 0) {
        return hypot($p1[0] - $p0[0], $p1[1] - $p0[1]);
    }
    $phi = deg2rad($rotDeg);
    $cos = cos($phi);
    $sin = sin($phi);
    $dx = ($p0[0] - $p1[0]) / 2;
    $dy = ($p0[1] - $p1[1]) / 2;
    $x1 = $cos * $dx + $sin * $dy;
    $y1 = -$sin * $dx + $cos * $dy;

    $lam = ($x1 * $x1) / ($rx * $rx) + ($y1 * $y1) / ($ry * $ry);
    if ($lam > 1) {
        $k = sqrt($lam);
        $rx *= $k;
        $ry *= $k;
    }
    $num = $rx * $rx * $ry * $ry - $rx * $rx * $y1 * $y1 - $ry * $ry * $x1 * $x1;
    $den = $rx * $rx * $y1 * $y1 + $ry * $ry * $x1 * $x1;
    if (abs($den) < 1e-9) {
        return hypot($p1[0] - $p0[0], $p1[1] - $p0[1]);
    }
    $co = sqrt(max(0.0, $num / $den));
    if ($large === $sweep) {
        $co = -$co;
    }
    $cx1 = $co * $rx * $y1 / $ry;
    $cy1 = -$co * $ry * $x1 / $rx;

    $ux = ($x1 - $cx1) / $rx;
    $uy = ($y1 - $cy1) / $ry;
    $vx = (-$x1 - $cx1) / $rx;
    $vy = (-$y1 - $cy1) / $ry;
    $theta1 = atan2($uy, $ux);
    $delta = atan2($ux * $vy - $uy * $vx, $ux * $vx + $uy * $vy);
    if (!$sweep && $delta > 0) {
        $delta -= 2 * M_PI;
    }
    if ($sweep && $delta < 0) {
        $delta += 2 * M_PI;
    }

    $steps = max(12, (int)ceil(abs($delta) / (M_PI / 18)));
    $len = 0.0;
    $prev = [$p0[0], $p0[1]];
    for ($i = 1; $i <= $steps; $i++) {
        $t = $theta1 + $delta * ($i / $steps);
        $pt = [
            ($cos * $rx * cos($t) - $sin * $ry * sin($t)),
            ($sin * $rx * cos($t) + $cos * $ry * sin($t)),
        ];
        $pt[0] += ($p0[0] + $p1[0]) / 2 + $cos * $cx1 - $sin * $cy1;
        $pt[1] += ($p0[1] + $p1[1]) / 2 + $sin * $cx1 + $cos * $cy1;
        $len += hypot($pt[0] - $prev[0], $pt[1] - $prev[1]);
        $prev = $pt;
    }
    return $len;
}

function quote_extract_dxf_length_mm(string $path): float
{
    $file = fopen($path, 'rb');
    if ($file === false) {
        throw new RuntimeException('Unable to read DXF file.');
    }
    $unitScale = 1.0;
    $unitNext = false;
    $section = null;
    $sectionNameNext = false;
    $length = 0.0;
    $type = '';
    $data = [];
    $first = null;
    $previous = null;
    $vertex = null;
    $closed = false;
    $segment = static function (array $a, array $b): float {
        $chord = hypot($b['x'] - $a['x'], $b['y'] - $a['y']);
        $bulge = $a['bulge'];
        if (abs($bulge) < 1e-9) {
            return $chord;
        }
        return $chord * (1 + $bulge * $bulge) * abs(atan($bulge)) / abs($bulge);
    };
    $finishVertex = static function () use (&$vertex, &$previous, &$first, &$length, $segment): void {
        if ($vertex === null) {
            return;
        }
        if ($previous !== null) {
            $length += $segment($previous, $vertex);
        } else {
            $first = $vertex;
        }
        $previous = $vertex;
        $vertex = null;
    };
    $finishEntity = static function () use (&$type, &$data, &$length, &$first, &$previous, &$closed, $finishVertex, $segment): void {
        if ($type === 'LWPOLYLINE') {
            $finishVertex();
            if ($closed && $first !== null && $previous !== null && $first !== $previous) {
                $length += $segment($previous, $first);
            }
        } elseif ($type === 'LINE') {
            $length += hypot(($data[11] ?? 0) - ($data[10] ?? 0), ($data[21] ?? 0) - ($data[20] ?? 0));
        } elseif ($type === 'CIRCLE') {
            $length += 2 * M_PI * max(0.0, $data[40] ?? 0);
        } elseif ($type === 'ARC') {
            $span = fmod(($data[51] ?? 0) - ($data[50] ?? 0) + 360.0, 360.0);
            $length += deg2rad($span) * max(0.0, $data[40] ?? 0);
        }
        $data = [];
        $first = null;
        $previous = null;
        $closed = false;
    };
    try {
        $hasPairs = false;
        while (($codeLine = fgets($file)) !== false) {
            $valueLine = fgets($file);
            if ($valueLine === false) {
                throw new RuntimeException('The DXF file contains an incomplete group.');
            }
            $hasPairs = true;
            $code = trim($codeLine);
            $value = trim($valueLine);
            if ($code === '0' && strtoupper($value) === 'SECTION') {
                $finishEntity();
                $type = '';
                $sectionNameNext = true;
                continue;
            }
            if ($sectionNameNext) {
                if ($code !== '2') throw new RuntimeException('Missing DXF section name.');
                $section = strtoupper($value);
                $sectionNameNext = false;
                continue;
            }
            if ($code === '0' && strtoupper($value) === 'ENDSEC') {
                $finishEntity();
                $type = '';
                $section = '';
                continue;
            }
            if ($section === 'HEADER' && $unitNext && $code === '70') {
                $unitScale = match ((int)$value) {
                    0, 4 => 1.0, 1 => 25.4, 2 => 304.8, 3 => 1609344.0, 5 => 10.0, 6 => 1000.0,
                    7 => 1e6, 8 => 0.0000254, 9 => 0.0254, 10 => 914.4, 11 => 1e-7, 12 => 1e-6,
                    13 => 0.001, 14 => 100.0, 15 => 10000.0, 16 => 100000.0, 17 => 1e12,
                    default => throw new RuntimeException('Please export the drawing in millimetres.'),
                };
            }
            $unitNext = $code === '9' && strtoupper($value) === '$INSUNITS';
            if ($section !== null && $section !== 'ENTITIES') continue;
            if ($code === '0') {
                $finishEntity();
                $type = strtoupper($value);
                if (!in_array($type, ['LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'EOF'], true)) {
                    throw new RuntimeException('This drawing needs review. Export cutting paths as lines, arcs, circles or lightweight polylines for an instant price.');
                }
            } elseif ($type === 'LWPOLYLINE') {
                if ($code === '70') {
                    $closed = (((int)$value) & 1) === 1;
                } elseif ($code === '10') {
                    $finishVertex();
                    $vertex = ['x' => (float)$value, 'y' => 0.0, 'bulge' => 0.0];
                } elseif ($vertex !== null && $code === '20') {
                    $vertex['y'] = (float)$value;
                } elseif ($vertex !== null && $code === '42') {
                    $vertex['bulge'] = (float)$value;
                }
            } elseif (in_array($type, ['LINE', 'CIRCLE', 'ARC'], true)
                && in_array($code, ['10', '20', '11', '21', '40', '50', '51'], true)
                && !isset($data[(int)$code])) {
                $data[(int)$code] = (float)$value;
            }
        }
        if (!$hasPairs || !feof($file)) {
            throw new RuntimeException('Unable to read DXF file.');
        }
        $finishEntity();
    } finally {
        fclose($file);
    }
    return $length * $unitScale;
}

function quote_measure_vector_mm(string $path, string $ext, array &$warnings): ?float
{
    $ext = strtolower($ext);
    if ($ext === 'svg') {
        return quote_extract_svg_length_mm($path, $warnings);
    }
    if ($ext === 'dxf') {
        return quote_extract_dxf_length_mm($path);
    }
    return null;
}

function quote_build_estimate(array $machine, array $material, array $rate, array $settings, array $input): array
{
    $vectorLength = (float)($input['vector_length_mm'] ?? 0);
    $partW = max(1.0, (float)$input['part_width_mm']);
    $partH = max(1.0, (float)$input['part_height_mm']);
    $qty = max(1, (int)$input['quantity']);

    $speed = max(1.0, (float)$rate['cut_speed_mm_min']);
    $pierceSec = max(0.0, (float)$rate['pierce_time_sec']);
    $setupMinutes = max(0.0, (float)$machine['setup_minutes']);
    $cutMinutes = ($vectorLength * $qty / $speed) + ($pierceSec * $qty / 60);
    $totalMinutes = $setupMinutes + $cutMinutes;

    $hourlyRate = max(0.0, (float)$machine['hourly_rate']);
    $setupCost = max(0.0, (float)$machine['setup_cost']);
    $cutCost = ($totalMinutes / 60.0) * $hourlyRate;

    $sheetW = max(1.0, (float)$material['sheet_width_mm']);
    $sheetH = max(1.0, (float)$material['sheet_height_mm']);
    $sheetPrice = max(0.0, (float)$material['sheet_price']);
    $waste = max(0.0, (float)$material['waste_percent']);

    $fitA = (int)floor($sheetW / $partW) * (int)floor($sheetH / $partH);
    $fitB = (int)floor($sheetW / $partH) * (int)floor($sheetH / $partW);
    $partsPerSheet = max($fitA, $fitB);
    if ($partsPerSheet < 1) {
        throw new RuntimeException('This part does not fit on the configured sheet. Please contact us to review your project.');
    }
    $sheetByNest = (int)ceil($qty / $partsPerSheet);
    $partArea = $partW * $partH * $qty;
    $sheetArea = $sheetW * $sheetH;
    $sheetByArea = (int)ceil(($partArea * (1 + $waste / 100)) / max(1.0, $sheetArea));
    $sheetsNeeded = max(1, max($sheetByNest, $sheetByArea));
    $materialCost = $sheetsNeeded * $sheetPrice;

    $markup = (float)($settings['markup_percent'] ?? 0);
    $vat = (float)($settings['vat_percent'] ?? 0);
    $roundTo = (float)($settings['round_to'] ?? 0.5);
    $currency = (string)($settings['currency_symbol'] ?? '€');

    $subtotal = $setupCost + $cutCost + $materialCost;
    $subtotal *= (1 + max(0.0, $markup) / 100);
    $subtotal = max($subtotal, (float)$machine['min_charge']);
    $vatValue = $subtotal * max(0.0, $vat) / 100;
    $total = quote_round($subtotal + $vatValue, $roundTo);

    return [
        'currency' => $currency,
        'vector_length_mm' => round($vectorLength, 2),
        'speed_mm_min' => round($speed, 2),
        'setup_minutes' => round($setupMinutes, 2),
        'cut_minutes' => round($cutMinutes, 2),
        'total_minutes' => round($totalMinutes, 2),
        'parts_per_sheet' => $partsPerSheet,
        'sheets_needed' => $sheetsNeeded,
        'material_usage_area_mm2' => (int)round($partArea),
        'setup_cost' => round($setupCost, 2),
        'cut_cost' => round($cutCost, 2),
        'material_cost' => round($materialCost, 2),
        'vat_cost' => round($vatValue, 2),
        'total_cost' => $total,
    ];
}

function online_quote_fail(string $message, string $reason): never
{
    if (in_array($reason, ['upload_failed','file_save_failed','file_too_large','drawing_unreadable','unsupported_format'], true)) {
        site_daily_count('file_error');
    }
    flash_set('online_quote_error', $message);
    flash_set('online_quote_error_reason', $reason);
    redirect('/online-quote', 303);
}

/** Check settings the shop has explicitly verified before offering a price. */
function quote_require_reviewed_capacity(array $machine, array $material, array $rate, array $input): void
{
    $machineName = strtolower((string)($machine['code'] ?? '') . ' ' . (string)($machine['name'] ?? ''));
    $machineKey = preg_replace('/[^a-z0-9]+/', '', $machineName) ?? '';
    $materialKey = preg_replace('/[^a-z0-9]+/', '', strtolower((string)($material['name'] ?? ''))) ?? '';
    $isCo2 = str_contains($machineKey, 'co2') || str_contains($machineKey, 'carbondioxide');
    $isPvc = str_contains($materialKey, 'pvc') || str_contains($materialKey, 'polyvinylchloride')
        || str_contains($materialKey, 'vinyl') || str_contains($materialKey, 'foamex') || str_contains($materialKey, 'sintra');
    if ($isCo2 && $isPvc) {
        throw new DomainException('This material cannot be quoted for CO2 laser cutting. Please contact us for a safe alternative.');
    }
    if ((int)($rate['shop_reviewed'] ?? 0) !== 1) {
        throw new DomainException('This machine and material combination needs shop review before we can estimate a price. Please contact us.');
    }
    $bedW = (float)($machine['bed_width_mm'] ?? 0);
    $bedH = (float)($machine['bed_height_mm'] ?? 0);
    if (!is_finite($bedW) || !is_finite($bedH) || $bedW <= 0 || $bedH <= 0) {
        throw new DomainException('This machine’s working area has not been verified. Please contact us for a review.');
    }
    $fits = static fn(float $w, float $h): bool => is_finite($w) && is_finite($h) && $w > 0 && $h > 0
        && (($w <= $bedW && $h <= $bedH) || ($h <= $bedW && $w <= $bedH));
    if (!$fits((float)($input['part_width_mm'] ?? 0), (float)($input['part_height_mm'] ?? 0))) {
        throw new DomainException('The entered part size does not fit the selected machine’s configured working area. Please contact us for review.');
    }
    if (!$fits((float)($material['sheet_width_mm'] ?? 0), (float)($material['sheet_height_mm'] ?? 0))) {
        throw new DomainException('The configured material sheet does not fit the selected machine’s working area. Please contact us for review.');
    }
}

/** Match a single-part drawing to the requested dimensions without underpricing. */
function quote_verified_dxf_size(array $bounds, float $width, float $height): array
{
    $drawingW = (float)($bounds['width_mm'] ?? 0); $drawingH = (float)($bounds['height_mm'] ?? 0);
    if (!is_finite($drawingW) || !is_finite($drawingH) || $drawingW <= 0 || $drawingH <= 0 || !is_finite($width) || !is_finite($height) || $width <= 0 || $height <= 0) {
        throw new DomainException('The drawing dimensions need shop review. Please upload the drawing again.');
    }
    // The form is entered to 0.1 mm; rotate the part if the submitted axes are swapped.
    $near = static fn(float $a, float $b): bool => abs($a-$b) <= 0.10002;
    if ($near($drawingW,$width) && $near($drawingH,$height)) return [max($drawingW,$width), max($drawingH,$height)];
    if ($near($drawingH,$width) && $near($drawingW,$height)) return [max($drawingH,$width), max($drawingW,$height)];
    throw new DomainException('The entered part size does not match the drawing. Check the DXF units and dimensions, or contact us for a review.');
}

function quote_current_pricing(array $siteConfig, array $input): array
{
    if (($input['ext'] ?? '') !== 'dxf' || !is_array($input['verified_dxf_bounds'] ?? null)) throw new DomainException('Please upload the DXF drawing again so its dimensions can be checked.');
    $project = $input['cutting_project'] ?? 'drawing';
    if (!is_string($project) || !in_array($project, quote_cutting_projects(), true) || !isset(quote_project_catalog()[$project])) {
        throw new DomainException('This project option is unavailable. Please choose another project.');
    }
    [$input['part_width_mm'], $input['part_height_mm']] = quote_verified_dxf_size($input['verified_dxf_bounds'], (float)($input['part_width_mm'] ?? 0), (float)($input['part_height_mm'] ?? 0));
    $db = quote_db($siteConfig);
    $machine = $db->prepare('SELECT * FROM quote_machines WHERE id=? AND active=1');
    $machine->execute([$input['machine_id']]);
    $material = $db->prepare('SELECT * FROM quote_materials WHERE id=? AND active=1');
    $material->execute([$input['material_id']]);
    $rate = $db->prepare('SELECT * FROM quote_machine_materials WHERE machine_id=? AND material_id=? AND active=1');
    $rate->execute([$input['machine_id'], $input['material_id']]);
    $machine = $machine->fetch();
    $material = $material->fetch();
    $rate = $rate->fetch();
    if (!$machine || !$material || !$rate) throw new DomainException('This machine and material combination is no longer available. Please choose again.');
    if (!quote_cutting_project_matches($project, $machine, $material)) {
        throw new DomainException('That machine or material is not available for this project. Please choose an available option.');
    }
    quote_require_reviewed_capacity($machine, $material, $rate, $input);
    $settings = quote_settings($siteConfig);
    return [
        'machine'=>$machine, 'material'=>$material, 'rate'=>$rate, 'pricing_settings'=>$settings,
        'estimate'=>quote_build_estimate($machine, $material, $rate, $settings, $input),
    ];
}

function quote_refresh_preview(array $siteConfig, array $result): array
{
    if (isset($result['draft_expires']) && time() >= $result['draft_expires']) {
        throw new DomainException('Your temporary drawing has expired. Upload it again to get today’s price.');
    }
    $input = $result['input'];
    if (($input['ext'] ?? '') !== 'dxf' || !is_array($input['verified_dxf_bounds'] ?? null)) throw new DomainException('Please upload the DXF drawing again so its dimensions can be checked.');
    [$input['part_width_mm'], $input['part_height_mm']] = quote_verified_dxf_size($input['verified_dxf_bounds'], (float)($input['part_width_mm'] ?? 0), (float)($input['part_height_mm'] ?? 0));
    if (!isset($input['vector_length_mm'])) {
        // Pre-update sessions only kept the rounded length. Recover the exact measurement.
        $warnings = [];
        $file = $siteConfig['inquiries_dir'] . '/quote-files/' . basename($result['stored_file']);
        $input['vector_length_mm'] = quote_measure_vector_mm($file, $input['ext'], $warnings);
        if (!$input['vector_length_mm']) throw new DomainException('Please upload the drawing again to refresh the price.');
    }
    $pricing = quote_current_pricing($siteConfig, $input);
    $previous = $result['estimate'];
    $current = $pricing['estimate'];
    if ($previous['total_cost'] != $current['total_cost'] || $previous['currency'] !== $current['currency']) {
        $result['previous_price'] = $previous['currency'] . number_format((float)$previous['total_cost'], 2);
        $result['token'] = bin2hex(random_bytes(16));
    }
    return array_replace($result, $pricing, ['input'=>$input]);
}

function quote_preview_for_display(array $siteConfig): ?array
{
    $result = $_SESSION['online_quote_result'] ?? null;
    if (!$result || !online_quote_unlocked()) return null;
    $db = quote_db($siteConfig);
    $db->beginTransaction();
    try {
        $result = quote_refresh_preview($siteConfig, $result);
        $db->commit();
        return $_SESSION['online_quote_result'] = $result;
    } catch (RuntimeException $error) {
        if ($db->inTransaction()) $db->rollBack();
        flash_set('online_quote_error', $error instanceof PDOException ? 'Pricing is temporarily unavailable. Please try again.' : $error->getMessage());
        return null;
    } catch (DomainException $error) {
        $db->rollBack();
        flash_set('online_quote_error', $error->getMessage());
        return null;
    }
}

function handle_online_quote_calculate(array $siteConfig): never
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        redirect('/online-quote', 303);
    }
    if (!online_quote_unlocked()) {
        online_quote_fail('Please unlock the quote page with the PIN first.', 'access_required');
    }
    if (!csrf_valid($_POST['csrf_token'] ?? null)) {
        online_quote_fail('Security validation failed. Please try again.', 'validation_failed');
    }

    if (($_POST['drawing_contents'] ?? '') !== 'single') {
        online_quote_fail('For multiple parts or if you are unsure, please contact us so we can review your drawing and sheet requirements.', 'manual_quote_required');
    }

    $project = $_POST['cutting_project'] ?? 'drawing';
    if (!is_string($project) || !in_array($project, quote_cutting_projects(), true) || !isset(quote_project_catalog()[$project])) {
        online_quote_fail('This project option is unavailable. Please choose another project.', 'invalid_options');
    }
    $machineId = (int)($_POST['machine_id'] ?? 0);
    $materialId = (int)($_POST['material_id'] ?? 0);
    $partW = filter_var($_POST['part_width_mm'] ?? null, FILTER_VALIDATE_FLOAT);
    $partH = filter_var($_POST['part_height_mm'] ?? null, FILTER_VALIDATE_FLOAT);
    if ($partW === false || $partH === false || !is_finite($partW) || !is_finite($partH) || $partW < 1 || $partH < 1) {
        online_quote_fail('Please enter a part width and height of at least 1 mm.', 'invalid_dimensions');
    }
    $qty = filter_var($_POST['quantity'] ?? 1, FILTER_VALIDATE_INT, ['options'=>['min_range'=>1]]);
    if ($qty === false) online_quote_fail('Enter a whole number of parts, at least one.', 'invalid_dimensions');
    $note = trim((string)($_POST['note'] ?? ''));

    if (!isset($_FILES['vector_file']) || !is_array($_FILES['vector_file'])) {
        online_quote_fail('Please upload a vector file first.', 'file_missing');
    }
    $file = $_FILES['vector_file'];
    if ((int)$file['error'] !== UPLOAD_ERR_OK) {
        online_quote_fail('Vector file upload failed. Please try again.', 'upload_failed');
    }

    $name = basename((string)$file['name']);
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if ($ext !== 'dxf') {
        online_quote_fail('Please upload a DXF drawing. Contact us if you need help creating one.', 'unsupported_format');
    }
    if ((int)$file['size'] > 50 * 1024 * 1024) {
        online_quote_fail('File too large. Maximum size is 50MB.', 'file_too_large');
    }

    $dir = dirname(quote_db_path($siteConfig)) . '/quote-drafts';
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) online_quote_fail('Temporary storage is unavailable.', 'file_save_failed');
    $stored = bin2hex(random_bytes(16)) . '.' . $ext;
    $path = $dir . '/' . $stored;

    $warnings = [];
    try {
        $verifiedBounds = quote_dxf_bounds_mm((string)$file['tmp_name']);
        $vectorLength = quote_measure_vector_mm((string)$file['tmp_name'], $ext, $warnings);
    } catch (Throwable $e) {
        online_quote_fail('We could not read vector geometry from this file: ' . $e->getMessage(), 'drawing_unreadable');
    }

    if ($vectorLength === null || !is_finite($vectorLength) || $vectorLength <= 0) {
        online_quote_fail('No supported cutting geometry was found in this DXF drawing.', 'drawing_unreadable');
    }

    try {
        [$partW, $partH] = quote_verified_dxf_size($verifiedBounds, $partW, $partH);
    } catch (DomainException $e) {
        online_quote_fail($e->getMessage(), 'invalid_dimensions');
    }
    $input = ['machine_id'=>$machineId, 'material_id'=>$materialId, 'cutting_project'=>$project, 'part_width_mm'=>$partW, 'part_height_mm'=>$partH,
        'verified_dxf_bounds'=>$verifiedBounds,
        'vector_length_mm'=>$vectorLength, 'quantity'=>$qty, 'note'=>$note, 'ext'=>$ext];
    try {
        $pricing = quote_current_pricing($siteConfig, $input);
    } catch (DomainException $e) {
        online_quote_fail($e->getMessage(), 'invalid_options');
    } catch (PDOException $e) {
        online_quote_fail('Pricing is temporarily unavailable. Please try again.', 'quote_unavailable');
    } catch (RuntimeException $e) {
        online_quote_fail($e->getMessage(), 'quote_unavailable');
    }

    if (!move_uploaded_file((string)$file['tmp_name'], $path)) {
        online_quote_fail('Could not save the uploaded vector file.', 'file_save_failed');
    }
    $token = bin2hex(random_bytes(16));
    $result = $pricing + [
        'input' => $input,
        'draft_expires' => time() + 86400,
        'stored_file' => $stored,
        'original_file' => $name,
        'warnings' => $warnings,
    ];
    $previous = $_SESSION['online_quote_result'] ?? [];
    if (isset($previous['draft_expires'], $previous['stored_file'])) {
        $oldPath = $dir . '/' . basename($previous['stored_file']);
        if (is_file($oldPath)) unlink($oldPath);
    }
    $result['token'] = $token;
    $_SESSION['online_quote_result'] = $result;
    site_daily_count('estimate');
    flash_set('online_quote_success', 'Quote calculated successfully.');
    redirect('/online-quote', 303);
}

function handle_online_quote_book(array $siteConfig): never
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        redirect('/online-quote', 303);
    }
    if (!online_quote_unlocked()) {
        online_quote_fail('Please unlock the quote page first.', 'access_required');
    }
    if (!csrf_valid($_POST['csrf_token'] ?? null)) {
        online_quote_fail('Security validation failed. Please try again.', 'validation_failed');
    }

    $result = $_SESSION['online_quote_result'] ?? null;
    $token = trim((string)($_POST['quote_token'] ?? ''));
    if (!is_array($result) || $token === '') {
        online_quote_fail('Quote session expired. Please calculate again.', 'quote_expired');
    }
    if (!hash_equals((string)$result['token'], $token)) {
        flash_set('quote_review_notice', 'This form is out of date. Review the current estimate before sending your request.');
        redirect('/online-quote#current-estimate', 303);
    }

    $customer = [
        'name' => trim((string)($_POST['customer_name'] ?? '')),
        'email' => trim((string)($_POST['email'] ?? '')),
        'phone' => trim((string)($_POST['phone'] ?? '')),
        'message' => trim((string)($_POST['message'] ?? '')),
    ];
    if ($customer['name'] === '' || $customer['phone'] === '' || $customer['email'] === '') {
        online_quote_fail('Please fill your name, email and phone.', 'contact_details_incomplete');
    }
    if (filter_var($customer['email'], FILTER_VALIDATE_EMAIL) === false) {
        online_quote_fail('Please enter a valid email address.', 'invalid_email');
    }

    $db = quote_db($siteConfig);
    $draftPath = $finalPath = null;
    $db->exec('BEGIN IMMEDIATE');
    try {
        $estimateId = (int)($result['estimate_id'] ?? 0);
        $bookingKey = hash('sha256', $token);
        $linked = $db->prepare('SELECT id FROM quote_estimates WHERE (booking_key=? OR id=?) AND order_id IS NOT NULL');
        $linked->execute([$bookingKey, $estimateId]);
        if ($linked->fetchColumn() !== false) {
            $db->exec('ROLLBACK');
            unset($_SESSION['online_quote_result']);
            flash_set('online_quote_success', 'This order request was already received.');
            redirect('/online-quote', 303);
        }
        $result = quote_refresh_preview($siteConfig, $result);
        if ($result['token'] !== $token) {
            $db->exec('ROLLBACK');
            $_SESSION['online_quote_result'] = $result;
            flash_set('quote_booking_details', $customer);
            redirect('/online-quote#current-estimate', 303);
        }
        $input = $result['input'];
        $est = $result['estimate'];
        $snapshot = $result;
        unset($snapshot['token'], $snapshot['previous_price'], $snapshot['draft_expires']);
        $json = json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($estimateId) {
            $update = $db->prepare('UPDATE quote_estimates SET snapshot=?,booking_key=? WHERE id=? AND order_id IS NULL');
            $update->execute([$json,$bookingKey,$estimateId]);
            if ($update->rowCount() !== 1) throw new RuntimeException('Missing estimate.');
        } else {
            $db->prepare('INSERT INTO quote_estimates(snapshot,booking_key) VALUES (?,?)')->execute([$json,$bookingKey]);
            $estimateId = (int)$db->lastInsertId();
        }
        if (isset($result['draft_expires'])) {
            $filesDir = $siteConfig['inquiries_dir'] . '/quote-files';
            if (!is_dir($filesDir) && !mkdir($filesDir, 0750, true) && !is_dir($filesDir)) throw new RuntimeException('Cannot store drawing.');
            $filename = basename($result['stored_file']);
            $draftPath = dirname(quote_db_path($siteConfig)) . '/quote-drafts/' . $filename;
            $destination = $filesDir . '/' . $filename;
            if (!is_file($draftPath)) throw new DomainException('Your temporary drawing is unavailable. Please upload it again.');
            if (!link($draftPath, $destination) && fileinode($draftPath) !== @fileinode($destination)) throw new RuntimeException('Cannot save drawing.');
            $finalPath = $destination;
        }
        $db->prepare("
            INSERT INTO quote_orders (
                customer_name, email, phone, message, machine_id, material_id, part_width_mm, part_height_mm, quantity,
                vector_filename, vector_ext, vector_length_mm,
                estimate_setup_cost, estimate_cut_cost, estimate_material_cost, estimate_vat, estimate_total, estimate_minutes, estimate_payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ")->execute([
            $customer['name'], $customer['email'], $customer['phone'], $customer['message'],
            (int)$input['machine_id'], (int)$input['material_id'],
            (float)$input['part_width_mm'], (float)$input['part_height_mm'], (int)$input['quantity'],
            (string)($result['original_file'] ?? ''), (string)($input['ext'] ?? ''),
            (float)($est['vector_length_mm'] ?? 0),
            (float)($est['setup_cost'] ?? 0), (float)($est['cut_cost'] ?? 0), (float)($est['material_cost'] ?? 0),
            (float)($est['vat_cost'] ?? 0), (float)($est['total_cost'] ?? 0), (float)($est['total_minutes'] ?? 0),
            $json,
        ]);
        $db->prepare('UPDATE quote_estimates SET order_id=? WHERE id=?')->execute([(int)$db->lastInsertId(), $estimateId]);
        $db->exec('COMMIT');
    } catch (Throwable $error) {
        $db->exec('ROLLBACK');
        if ($finalPath !== null && is_file($finalPath)) unlink($finalPath);
        if ($error instanceof DomainException) online_quote_fail($error->getMessage(), 'quote_unavailable');
        online_quote_fail('We could not save the order request. Please try again.', 'quote_unavailable');
    }
    if ($draftPath !== null && is_file($draftPath)) unlink($draftPath);

    $subject = 'Order request for quote Q-' . $estimateId;
    $body = "Customer: {$customer['name']}\nEmail: {$customer['email']}\nPhone: {$customer['phone']}\n\n"
        . "Machine: " . (($result['machine']['name'] ?? '')) . "\n"
        . "Material: " . (($result['material']['name'] ?? '')) . "\n"
        . "Size: {$input['part_width_mm']} x {$input['part_height_mm']} mm\n"
        . "Qty: {$input['quantity']}\n"
        . "Vector file: " . (($result['original_file'] ?? '')) . "\n"
        . "Measured lines: {$est['vector_length_mm']} mm\n"
        . "Estimated total: {$est['currency']}{$est['total_cost']}\n\n"
        . "Customer message:\n{$customer['message']}\n";
    @mail((string)$siteConfig['email'], $subject, $body, "From: noreply@adotind.com\r\nReply-To: {$customer['email']}\r\n");

    $_SESSION['online_quote_result'] = null;
    site_daily_count('order');
    flash_set('online_quote_success', 'Order request received for quote Q-' . $estimateId . '. Our team will contact you.');
    redirect('/online-quote', 303);
}

function quote_dashboard_handle_settings(array $siteConfig): never
{
    dashboard_require_auth();
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !csrf_valid($_POST['csrf_token'] ?? null)) {
        flash_set('dashboard_error', 'Invalid settings request.');
        redirect('/dashboard', 303);
    }
    $allowed = ['currency_symbol', 'vat_percent', 'markup_percent', 'round_to', 'instant_exts'];
    $db = quote_db($siteConfig);
    $st = $db->prepare('INSERT INTO quote_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    foreach ($allowed as $k) {
        $v = trim((string)($_POST[$k] ?? ''));
        if ($k === 'currency_symbol') {
            $v = mb_substr($v !== '' ? $v : '€', 0, 4);
        }
        if (in_array($k, ['vat_percent', 'markup_percent', 'round_to'], true)) {
            $v = (string)max(0, (float)$v);
        }
        $st->execute([$k, $v]);
    }
    flash_set('dashboard_success', 'Quote settings saved.');
    redirect('/dashboard', 303);
}

function quote_dashboard_handle_machine(array $siteConfig): never
{
    dashboard_require_auth();
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !csrf_valid($_POST['csrf_token'] ?? null)) {
        flash_set('dashboard_error', 'Invalid machine request.');
        redirect('/dashboard', 303);
    }
    $db = quote_db($siteConfig);
    $id = (int)($_POST['id'] ?? 0);
    $action = (string)($_POST['action'] ?? 'save');
    if ($action === 'delete' && $id > 0) {
        $db->prepare('DELETE FROM quote_machines WHERE id = ?')->execute([$id]);
        flash_set('dashboard_success', 'Machine deleted.');
        redirect('/dashboard', 303);
    }

    $name = trim((string)($_POST['name'] ?? ''));
    $code = preg_replace('/[^a-z0-9_-]+/i', '-', strtolower(trim((string)($_POST['code'] ?? '')))) ?? '';
    $setupMin = max(0.0, (float)($_POST['setup_minutes'] ?? 0));
    $setupCost = max(0.0, (float)($_POST['setup_cost'] ?? 0));
    $hourlyRate = max(0.0, (float)($_POST['hourly_rate'] ?? 0));
    $minCharge = max(0.0, (float)($_POST['min_charge'] ?? 0));
    $active = !empty($_POST['active']) ? 1 : 0;
    $sort = (int)($_POST['sort_order'] ?? 0);

    if ($name === '' || $code === '') {
        flash_set('dashboard_error', 'Machine name and code are required.');
        redirect('/dashboard', 303);
    }

    if ($id > 0) {
        $db->prepare('UPDATE quote_machines SET name=?, code=?, setup_minutes=?, setup_cost=?, hourly_rate=?, min_charge=?, active=?, sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$name, $code, $setupMin, $setupCost, $hourlyRate, $minCharge, $active, $sort, $id]);
        flash_set('dashboard_success', 'Machine updated.');
    } else {
        $db->prepare('INSERT INTO quote_machines (name, code, setup_minutes, setup_cost, hourly_rate, min_charge, active, sort_order, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)')
            ->execute([$name, $code, $setupMin, $setupCost, $hourlyRate, $minCharge, $active, $sort]);
        flash_set('dashboard_success', 'Machine added.');
    }
    redirect('/dashboard', 303);
}

function quote_dashboard_handle_material(array $siteConfig): never
{
    dashboard_require_auth();
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !csrf_valid($_POST['csrf_token'] ?? null)) {
        flash_set('dashboard_error', 'Invalid material request.');
        redirect('/dashboard', 303);
    }
    $db = quote_db($siteConfig);
    $id = (int)($_POST['id'] ?? 0);
    $action = (string)($_POST['action'] ?? 'save');
    if ($action === 'delete' && $id > 0) {
        $db->prepare('DELETE FROM quote_materials WHERE id = ?')->execute([$id]);
        flash_set('dashboard_success', 'Material deleted.');
        redirect('/dashboard', 303);
    }

    $name = trim((string)($_POST['name'] ?? ''));
    $sw = max(1.0, (float)($_POST['sheet_width_mm'] ?? 0));
    $sh = max(1.0, (float)($_POST['sheet_height_mm'] ?? 0));
    $sp = max(0.0, (float)($_POST['sheet_price'] ?? 0));
    $waste = max(0.0, (float)($_POST['waste_percent'] ?? 0));
    $active = !empty($_POST['active']) ? 1 : 0;
    $sort = (int)($_POST['sort_order'] ?? 0);
    if ($name === '') {
        flash_set('dashboard_error', 'Material name is required.');
        redirect('/dashboard', 303);
    }

    if ($id > 0) {
        $db->prepare('UPDATE quote_materials SET name=?, sheet_width_mm=?, sheet_height_mm=?, sheet_price=?, waste_percent=?, active=?, sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$name, $sw, $sh, $sp, $waste, $active, $sort, $id]);
        flash_set('dashboard_success', 'Material updated.');
    } else {
        $db->prepare('INSERT INTO quote_materials (name, sheet_width_mm, sheet_height_mm, sheet_price, waste_percent, active, sort_order, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)')
            ->execute([$name, $sw, $sh, $sp, $waste, $active, $sort]);
        flash_set('dashboard_success', 'Material added.');
    }
    redirect('/dashboard', 303);
}

function quote_dashboard_handle_rate(array $siteConfig): never
{
    dashboard_require_auth();
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !csrf_valid($_POST['csrf_token'] ?? null)) {
        flash_set('dashboard_error', 'Invalid speed/rate request.');
        redirect('/dashboard', 303);
    }
    $db = quote_db($siteConfig);
    $id = (int)($_POST['id'] ?? 0);
    $machineId = (int)($_POST['machine_id'] ?? 0);
    $materialId = (int)($_POST['material_id'] ?? 0);
    $speed = max(0.1, (float)($_POST['cut_speed_mm_min'] ?? 0));
    $pierce = max(0.0, (float)($_POST['pierce_time_sec'] ?? 0));
    $active = !empty($_POST['active']) ? 1 : 0;
    $action = (string)($_POST['action'] ?? 'save');

    if ($action === 'delete' && $id > 0) {
        $db->prepare('DELETE FROM quote_machine_materials WHERE id = ?')->execute([$id]);
        flash_set('dashboard_success', 'Speed entry deleted.');
        redirect('/dashboard', 303);
    }

    if ($machineId <= 0 || $materialId <= 0) {
        flash_set('dashboard_error', 'Machine and material are required for speed setup.');
        redirect('/dashboard', 303);
    }

    if ($id > 0) {
        $db->prepare('UPDATE quote_machine_materials SET machine_id=?, material_id=?, cut_speed_mm_min=?, pierce_time_sec=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            ->execute([$machineId, $materialId, $speed, $pierce, $active, $id]);
    } else {
        $db->prepare('INSERT INTO quote_machine_materials (machine_id, material_id, cut_speed_mm_min, pierce_time_sec, active, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(machine_id, material_id) DO UPDATE SET cut_speed_mm_min=excluded.cut_speed_mm_min, pierce_time_sec=excluded.pierce_time_sec, active=excluded.active, updated_at=CURRENT_TIMESTAMP')
            ->execute([$machineId, $materialId, $speed, $pierce, $active]);
    }
    flash_set('dashboard_success', 'Speed/rate saved.');
    redirect('/dashboard', 303);
}
