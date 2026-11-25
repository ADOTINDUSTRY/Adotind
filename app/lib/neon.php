<?php
declare(strict_types=1);

function neon_font_library(): array
{
    static $library;
    return $library ??= json_decode(file_get_contents(dirname(__DIR__) . '/data/neon-library.json'), true, 16, JSON_THROW_ON_ERROR);
}

// Publish the same specimens and identifiers used by the deployed editor into
// the ERP's shared store. Already-submitted requests keep their original proofs.
function neon_publish_library(PDO $db): void
{
    $library = neon_font_library();
    $db->exec('BEGIN IMMEDIATE');
    try {
        $db->exec('CREATE TABLE IF NOT EXISTS font_library (id INTEGER PRIMARY KEY CHECK(id=1), edition TEXT NOT NULL, catalog TEXT NOT NULL)');
        $put = $db->prepare('INSERT INTO font_library(id,edition,catalog) VALUES(1,?,?)
            ON CONFLICT(id) DO UPDATE SET edition=excluded.edition,catalog=excluded.catalog WHERE edition<>excluded.edition');
        $put->execute([$library['edition'], json_encode($library['fonts'], JSON_THROW_ON_ERROR)]);
        if ($put->rowCount()) $db->exec('UPDATE shop SET revision=revision+1 WHERE id=1');
        $db->exec('COMMIT');
    } catch (Throwable $e) {
        $db->exec('ROLLBACK');
        throw $e;
    }
}

function neon_db(): PDO
{
    static $db;
    if ($db instanceof PDO) return $db;
    $db = new PDO('sqlite:/var/www/site-tracking/neon-shop.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec('PRAGMA busy_timeout=5000');
    if (!(int)$db->query('PRAGMA user_version')->fetchColumn()) {
        $db->beginTransaction();
        try {
            $db->exec("CREATE TABLE IF NOT EXISTS shop (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, settings TEXT NOT NULL);
                INSERT OR IGNORE INTO shop VALUES (1,1,'{}');
                CREATE TABLE IF NOT EXISTS requests (
                    id INTEGER PRIMARY KEY, received TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    request_key TEXT NOT NULL UNIQUE, reviewed INTEGER NOT NULL DEFAULT 0,
                    name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL,
                    design TEXT NOT NULL, width_mm REAL NOT NULL, height_mm REAL NOT NULL, tube_length_mm REAL NOT NULL,
                    warnings TEXT NOT NULL, estimated_cents INTEGER, retail_breakdown TEXT, settings_revision INTEGER NOT NULL,
                    svg TEXT NOT NULL, dxf TEXT NOT NULL);
                PRAGMA user_version=1");
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }
    return $db;
}

function neon_settings(PDO $db): array
{
    $row = $db->query('SELECT revision,settings FROM shop WHERE id=1')->fetch();
    $values = json_decode($row['settings'], true, 16, JSON_THROW_ON_ERROR);
    unset($values['rateDraft']);
    $library = neon_font_library();
    $available = array_column($library['fonts'], 'id');
    $enabled = array_values(array_intersect($values['fonts'] ?? $available, $available));
    return ['revision'=>(int)$row['revision'], 'edition'=>$library['edition'], 'fonts'=>$enabled] + $values + [
        'colors'=>['#ff488d','#ff6248','#ffb149','#ffedcc','#caff63','#58ebcc','#68c7ff','#bc8bff'],
        'minWidth'=>200, 'maxWidth'=>3000, 'rates'=>null,
    ];
}

function neon_public_rates(): array
{
    if (!is_dir('/var/www/site-tracking')) return [];
    try {
        return neon_settings(neon_db());
    } catch (Throwable $e) {
        error_log('Neon shop settings unavailable: ' . get_class($e));
        return ['revision'=>0,'rates'=>null];
    }
}

function neon_reply(int $status, array $data): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_THROW_ON_ERROR);
    exit;
}

function neon_measure(string $design): array
{
    $command = ['/usr/bin/timeout','8','/usr/local/bin/node','--max-old-space-size=96',dirname(__DIR__) . '/cli/neon-measure.cjs'];
    $proc = proc_open($command, [0=>['pipe','r'],1=>['pipe','w'],2=>['file','/dev/null','a']], $pipes);
    if (!is_resource($proc)) throw new RuntimeException('Geometry service unavailable');
    fwrite($pipes[0], $design);
    fclose($pipes[0]);
    $json = stream_get_contents($pipes[1], 12000000);
    fclose($pipes[1]);
    if (proc_close($proc) !== 0 || !$json) throw new RuntimeException('Geometry service unavailable');
    return json_decode($json, true, 12, JSON_THROW_ON_ERROR);
}

function neon_handle_request(): never
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { header('Allow: POST'); neon_reply(405, ['error'=>'Send your design from the editor.']); }
    if (!online_quote_unlocked() || !is_string($_POST['csrf_token'] ?? null) || !csrf_valid($_POST['csrf_token'])) {
        neon_reply(403, ['error'=>'Reopen the private editor before submitting.']);
    }
    foreach (['design','request_id','customer_name','email','message'] as $field) {
        if (!is_string($_POST[$field] ?? null)) neon_reply(422, ['error'=>'Complete the design and contact form.']);
    }
    $design = $_POST['design'];
    $name = trim($_POST['customer_name']);
    $email = trim($_POST['email']);
    $message = trim($_POST['message']);
    if (strlen($design) > 8192 || !preg_match('/^[a-f0-9]{32}$/D', $_POST['request_id'])
        || $name === '' || strlen($name)>240 || strlen($email)>254 || !filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($message)>4000) {
        neon_reply(422, ['error'=>'Check your name, email and design before sending.']);
    }
    $key = hash_hmac('sha256', $_POST['request_id'], csrf_token());
    try {
        $db = neon_db();
    } catch (Throwable $e) {
        neon_reply(503, ['error'=>'Design requests are temporarily unavailable. Save your design and try again.']);
    }
    $existing = $db->prepare('SELECT id FROM requests WHERE request_key=?');
    $existing->execute([$key]);
    $id = $existing->fetchColumn();
    $existing->closeCursor();
    if ($id) neon_reply(200, ['reference'=>'N-' . $id]);
    try {
        $proof = neon_measure($design);
        if (isset($proof['error'])) neon_reply(422, ['error'=>$proof['error']]);
        $spec = $proof['design'];
        $db->exec('BEGIN IMMEDIATE');
        $shop = neon_settings($db);
        if ($shop['edition'] !== ($_POST['edition'] ?? '') || (string)$shop['revision'] !== ($_POST['revision'] ?? '') ||
            !in_array($spec['font'], $shop['fonts'], true) || !in_array($spec['color'], $shop['colors'], true)
            || $spec['widthMm'] < $shop['minWidth'] || $spec['widthMm'] > $shop['maxWidth']) {
            $db->exec('ROLLBACK');
            neon_reply(409, ['error'=>'Shop options or pricing changed. Download your design, then reload and review it before sending.']);
        }
        $rates = $shop['rates'];
        $breakdown = $rates === null ? null : [
            'perMetre'=>$rates['perMetre'], 'base'=>$rates['base'],
            'tube'=>(int)round(round($proof['lengthMm']) * $rates['perMetre'] / 1000),
            'backing'=>$rates[$spec['backing']], 'mount'=>$rates[$spec['mount']],
        ];
        $estimate = $breakdown === null ? null : $breakdown['base'] + $breakdown['tube'] + $breakdown['backing'] + $breakdown['mount'];
        $insert = $db->prepare('INSERT INTO requests(request_key,name,email,message,design,width_mm,height_mm,tube_length_mm,warnings,estimated_cents,retail_breakdown,settings_revision,svg,dxf)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(request_key) DO NOTHING');
        $insert->execute([$key,$name,$email,$message,json_encode($spec, JSON_THROW_ON_ERROR),$proof['widthMm'],$proof['heightMm'],
            $proof['lengthMm'],json_encode($proof['warnings'], JSON_THROW_ON_ERROR),$estimate,
            $breakdown === null ? null : json_encode($breakdown, JSON_THROW_ON_ERROR),$shop['revision'],$proof['svg'],$proof['dxf']]);
        $fresh = $insert->rowCount();
        $existing->execute([$key]);
        $id = $existing->fetchColumn();
        $existing->closeCursor();
        $db->exec('COMMIT');
    } catch (Throwable $e) {
        // The connection is released at the end of the request. SQLite rolls back any open transaction.
        error_log('Neon quote request could not be prepared: ' . get_class($e));
        neon_reply(503, ['error'=>'We could not save your request. Your design is still here. Please try again.']);
    }
    if ($fresh) site_daily_count('inquiry');
    neon_reply(200, ['reference'=>'N-' . $id]);
}
