<?php
declare(strict_types=1);

function quote_db_path(array $siteConfig): string
{
    $configured = (string)($siteConfig['quote_db_file'] ?? '');
    if ($configured !== '') {
        return $configured;
    }
    $root = dirname((string)($siteConfig['inquiries_dir'] ?? (__DIR__ . '/../../storage/inquiries')));
    return rtrim($root, '/') . '/quote-system.sqlite';
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
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');
    // Schema/seed only once per database file; user_version marks completion.
    if ((int)$pdo->query('PRAGMA user_version')->fetchColumn() < 1) {
        quote_install_schema($pdo);
        quote_seed_defaults($pdo);
        $pdo->exec('PRAGMA user_version = 1');
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
    return ['machines' => $machines, 'materials' => $materials, 'rates' => $rates, 'settings' => quote_settings($siteConfig)];
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
            if ($unitNext && $code === '70') {
                $unitScale = match ((int)$value) {
                    1 => 25.4, 2 => 304.8, 4 => 1.0, 5 => 10.0, 6 => 1000.0,
                    14 => 100.0,
                    default => 1.0,
                };
            }
            $unitNext = $code === '9' && strtoupper($value) === '$INSUNITS';
            if ($code === '0') {
                $finishEntity();
                $type = strtoupper($value);
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

function handle_online_quote_calculate(array $siteConfig): never
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        redirect('/online-quote', 303);
    }
    if (!online_quote_unlocked()) {
        flash_set('online_quote_error', 'Please unlock the quote page with the PIN first.');
        redirect('/online-quote', 303);
    }
    if (!csrf_valid($_POST['csrf_token'] ?? null)) {
        flash_set('online_quote_error', 'Security validation failed. Please try again.');
        redirect('/online-quote', 303);
    }

    if (($_POST['drawing_contents'] ?? '') !== 'single') {
        flash_set('online_quote_error', 'For multiple parts or if you are unsure, please contact us so we can review your drawing and sheet requirements.');
        redirect('/online-quote', 303);
    }

    $machineId = (int)($_POST['machine_id'] ?? 0);
    $materialId = (int)($_POST['material_id'] ?? 0);
    $partW = filter_var($_POST['part_width_mm'] ?? null, FILTER_VALIDATE_FLOAT);
    $partH = filter_var($_POST['part_height_mm'] ?? null, FILTER_VALIDATE_FLOAT);
    if ($partW === false || $partH === false || !is_finite($partW) || !is_finite($partH) || $partW < 1 || $partH < 1) {
        flash_set('online_quote_error', 'Please enter a part width and height of at least 1 mm.');
        redirect('/online-quote', 303);
    }
    $qty = max(1, (int)($_POST['quantity'] ?? 1));
    $note = trim((string)($_POST['note'] ?? ''));

    if (!isset($_FILES['vector_file']) || !is_array($_FILES['vector_file'])) {
        flash_set('online_quote_error', 'Please upload a vector file first.');
        redirect('/online-quote', 303);
    }
    $file = $_FILES['vector_file'];
    if ((int)$file['error'] !== UPLOAD_ERR_OK) {
        flash_set('online_quote_error', 'Vector file upload failed. Please try again.');
        redirect('/online-quote', 303);
    }

    $name = basename((string)$file['name']);
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if ($ext !== 'dxf') {
        flash_set('online_quote_error', 'Please upload a DXF drawing. Contact us if you need help creating one.');
        redirect('/online-quote', 303);
    }
    if ((int)$file['size'] > 50 * 1024 * 1024) {
        flash_set('online_quote_error', 'File too large. Maximum size is 50MB.');
        redirect('/online-quote', 303);
    }

    $dir = rtrim((string)($siteConfig['inquiries_dir'] ?? (__DIR__ . '/../../storage/inquiries')), '/') . '/quote-files';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $stored = date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
    $path = $dir . '/' . $stored;
    if (!move_uploaded_file((string)$file['tmp_name'], $path)) {
        flash_set('online_quote_error', 'Could not save the uploaded vector file.');
        redirect('/online-quote', 303);
    }

    $db = quote_db($siteConfig);
    $machine = $db->prepare('SELECT * FROM quote_machines WHERE id = ? AND active = 1');
    $machine->execute([$machineId]);
    $machine = $machine->fetch();
    $material = $db->prepare('SELECT * FROM quote_materials WHERE id = ? AND active = 1');
    $material->execute([$materialId]);
    $material = $material->fetch();
    if (!is_array($machine) || !is_array($material)) {
        flash_set('online_quote_error', 'Invalid machine or material selection.');
        redirect('/online-quote', 303);
    }

    $rate = $db->prepare('SELECT * FROM quote_machine_materials WHERE machine_id = ? AND material_id = ? AND active = 1');
    $rate->execute([(int)$machine['id'], (int)$material['id']]);
    $rate = $rate->fetch();
    if (!is_array($rate)) {
        flash_set('online_quote_error', 'Cutting speed is not configured for this machine/material pair yet.');
        redirect('/online-quote', 303);
    }

    $warnings = [];
    try {
        $vectorLength = quote_measure_vector_mm($path, $ext, $warnings);
    } catch (Throwable $e) {
        flash_set('online_quote_error', 'We could not read vector geometry from this file: ' . $e->getMessage());
        redirect('/online-quote', 303);
    }

    if ($vectorLength === null) {
        flash_set('online_quote_error', 'This file type is accepted, but instant line-length measurement is available for SVG and DXF only. Please upload SVG or DXF for instant price.');
        redirect('/online-quote', 303);
    }

    $settings = quote_settings($siteConfig);
    try {
        $estimate = quote_build_estimate($machine, $material, $rate, $settings, [
            'vector_length_mm' => $vectorLength,
            'part_width_mm' => $partW,
            'part_height_mm' => $partH,
            'quantity' => $qty,
        ]);
    } catch (RuntimeException $e) {
        flash_set('online_quote_error', $e->getMessage());
        redirect('/online-quote', 303);
    }

    $token = bin2hex(random_bytes(16));
    $_SESSION['online_quote_result'] = [
        'token' => $token,
        'stored_file' => $stored,
        'original_file' => $name,
        'machine' => $machine,
        'material' => $material,
        'rate' => $rate,
        'input' => [
            'machine_id' => $machineId,
            'material_id' => $materialId,
            'part_width_mm' => $partW,
            'part_height_mm' => $partH,
            'quantity' => $qty,
            'note' => $note,
            'ext' => $ext,
        ],
        'warnings' => $warnings,
        'estimate' => $estimate,
    ];
    flash_set('online_quote_success', 'Quote calculated successfully.');
    redirect('/online-quote', 303);
}

function handle_online_quote_book(array $siteConfig): never
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        redirect('/online-quote', 303);
    }
    if (!online_quote_unlocked()) {
        flash_set('online_quote_error', 'Please unlock the quote page first.');
        redirect('/online-quote', 303);
    }
    if (!csrf_valid($_POST['csrf_token'] ?? null)) {
        flash_set('online_quote_error', 'Security validation failed. Please try again.');
        redirect('/online-quote', 303);
    }

    $result = $_SESSION['online_quote_result'] ?? null;
    $token = trim((string)($_POST['quote_token'] ?? ''));
    if (!is_array($result) || $token === '' || !hash_equals((string)($result['token'] ?? ''), $token)) {
        flash_set('online_quote_error', 'Quote session expired. Please calculate again.');
        redirect('/online-quote', 303);
    }

    $customer = [
        'name' => trim((string)($_POST['customer_name'] ?? '')),
        'email' => trim((string)($_POST['email'] ?? '')),
        'phone' => trim((string)($_POST['phone'] ?? '')),
        'message' => trim((string)($_POST['message'] ?? '')),
    ];
    if ($customer['name'] === '' || $customer['phone'] === '' || $customer['email'] === '') {
        flash_set('online_quote_error', 'Please fill your name, email and phone.');
        redirect('/online-quote', 303);
    }
    if (filter_var($customer['email'], FILTER_VALIDATE_EMAIL) === false) {
        flash_set('online_quote_error', 'Please enter a valid email address.');
        redirect('/online-quote', 303);
    }

    $db = quote_db($siteConfig);
    $est = (array)$result['estimate'];
    $input = (array)$result['input'];
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
        json_encode($result, JSON_UNESCAPED_SLASHES),
    ]);

    $subject = 'New Online Quote Booking';
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
    flash_set('online_quote_success', 'Order request booked successfully. Our team will contact you.');
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
