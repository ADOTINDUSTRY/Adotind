<?php
declare(strict_types=1);

/** Isolated loopback test: no real database, PIN, notifications or customer data. */
function http3d_assert(bool $ok, string $reason): void { if (!$ok) throw new RuntimeException($reason); }
function http3d_request(string $url, string $method = 'GET', ?array $data = null, string &$cookie = ''): array
{
    $headers = ['Accept: application/json'];
    if ($cookie !== '') $headers[] = 'Cookie: ' . $cookie;
    $content = '';
    if ($data !== null) { $headers[] = 'Content-Type: application/json'; $content = json_encode($data, JSON_THROW_ON_ERROR); }
    $context = stream_context_create(['http'=>['method'=>$method, 'header'=>implode("\r\n", $headers), 'content'=>$content, 'ignore_errors'=>true, 'timeout'=>8, 'follow_location'=>0]]);
    $body = @file_get_contents($url, false, $context);
    $lines = $http_response_header ?? [];
    if (!preg_match('/\s(\d{3})\s/', $lines[0] ?? '', $status)) throw new RuntimeException('No HTTP response from test server.');
    foreach ($lines as $line) if (preg_match('/^Set-Cookie:\s*(PHPSESSID=[^;]+)/i', $line, $match)) $cookie = $match[1];
    return [(int)$status[1], json_decode(is_string($body) ? $body : '', true)];
}

$fixture = sys_get_temp_dir() . '/letter3d-http-' . bin2hex(random_bytes(8));
mkdir($fixture, 0700, true); mkdir($fixture . '/sessions', 0700); mkdir($fixture . '/lib', 0700); mkdir($fixture . '/data', 0700);
$sourceRoot = dirname(__DIR__);
$dbPath = $fixture . '/quote.sqlite';
require_once $sourceRoot . '/app/lib/quote_system.php';
require_once $sourceRoot . '/app/lib/letter3d_quote.php';
$db = quote_db(['quote_db_file'=>$dbPath]);
letter3d_schema($db);
$db->exec("UPDATE quote_settings SET value='19' WHERE key='vat_percent'");
$db->exec("INSERT INTO quote_letter3d_products(name,description,setup_eur,letter_eur,area_eur_m2,minimum_eur,min_width_mm,max_width_mm,min_height_mm,max_height_mm,max_characters,max_quantity,enabled,reviewed) VALUES ('Test lettering','Original terms',10,5,20,0,100,3000,50,2000,50,10,1,1)");
// The application currently stores its PIN in source. Replace it in an isolated
// copy, so this test exercises the real handler without using a production PIN.
$online = file_get_contents($sourceRoot . '/app/lib/online_quote.php');
$online = preg_replace('~hash_equals\(\'[^\']+\', \$pin\)~', 'hash_equals(\'FIXTURE_PIN\', $pin)', $online, 1, $replacements);
http3d_assert($replacements === 1, 'Fixture PIN replacement did not match.');
file_put_contents($fixture . '/lib/online_quote.php', $online);
copy($sourceRoot . '/app/data/quote-projects.php', $fixture . '/data/quote-projects.php');
$router = <<<'ROUTER'
<?php
declare(strict_types=1);
ini_set('session.save_path', __DIR__ . '/sessions');
session_start();
require SOURCE_ROOT . '/app/lib/functions.php';
require SOURCE_ROOT . '/app/lib/quote_system.php';
require SOURCE_ROOT . '/app/lib/website_storage.php';
require __DIR__ . '/lib/online_quote.php';
require SOURCE_ROOT . '/app/lib/letter3d_quote.php';
$config = ['quote_db_file'=>__DIR__ . '/quote.sqlite'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/session') { header('Content-Type: application/json'); echo json_encode(['csrf'=>csrf_token()]); exit; }
if ($path === '/pin') { handle_online_quote_pin_submit(); }
if ($path === '/expire') {
    $data = json_decode(file_get_contents('php://input'), true);
    if (isset($data['key'], $_SESSION['letter3d_request_keys'][$data['key']])) $_SESSION['letter3d_request_keys'][$data['key']] = time()-90000;
    header('Content-Type: application/json'); echo '{}'; exit;
}
if ($path === '/estimate') letter3d_handle_estimate($config);
if ($path === '/request') letter3d_handle_request($config);
http_response_code(404);
ROUTER;
$router = str_replace("declare(strict_types=1);", "declare(strict_types=1);\ndefine('SOURCE_ROOT', " . var_export($sourceRoot, true) . ");", $router);
file_put_contents($fixture . '/router.php', $router);
$sock = stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
if (!$sock) throw new RuntimeException('Could not reserve a loopback port.');
$address = stream_socket_get_name($sock, false); fclose($sock);
$extensionDir = realpath((string)ini_get('extension_dir')) ?: (string)ini_get('extension_dir');
$command = [PHP_BINARY, '-d', 'extension_dir=' . $extensionDir, '-d', 'extension=pdo_sqlite', '-d', 'extension=mbstring', '-S', $address, $fixture . '/router.php'];
$process = proc_open($command, [0=>['pipe','r'],1=>['file',$fixture . '/server.log','a'],2=>['file',$fixture . '/server.log','a']], $pipes, $fixture);
if (!is_resource($process)) throw new RuntimeException('Could not start fixture server.');
fclose($pipes[0]);
$base = 'http://' . $address;
try {
    $cookie = ''; $ready = false;
    for ($i=0; $i<50; $i++) { try { [$status,$session] = http3d_request($base . '/session', 'GET', null, $cookie); if ($status===200) { $ready=true; break; } } catch (Throwable $e) {} usleep(100000); }
    http3d_assert($ready && is_array($session) && is_string($session['csrf'] ?? null), 'Fixture server did not start: ' . (string)@file_get_contents($fixture . '/server.log'));
    $csrf = $session['csrf'];
    $design = ['csrf'=>$csrf,'product_id'=>1,'text'=>"A\r\nB",'font'=>'sans','colour'=>'#ff00aa','width_mm'=>1000,'height_mm'=>500,'quantity'=>2];
    [$status] = http3d_request($base . '/estimate', 'POST', $design, $cookie);
    http3d_assert($status === 403, 'Locked session must not receive an estimate.');
    // Exercise the real PIN handler using the fixture-only PIN and real CSRF.
    $pin = static function (string $pinValue, string $token) use ($base, &$cookie): int {
        $headers = ['Content-Type: application/x-www-form-urlencoded','Cookie: '.$cookie];
        $ctx=stream_context_create(['http'=>['method'=>'POST','header'=>implode("\r\n",$headers),'content'=>http_build_query(['pin'=>$pinValue,'csrf_token'=>$token]),'ignore_errors'=>true,'follow_location'=>0,'timeout'=>8]]);
        @file_get_contents($base . '/pin', false, $ctx);
        preg_match('/\s(\d{3})\s/', $http_response_header[0] ?? '', $match); return (int)($match[1] ?? 0);
    };
    http3d_assert($pin('BAD_PIN', $csrf) === 303, 'Wrong PIN should return to the quote page.');
    [$status] = http3d_request($base . '/estimate', 'POST', $design, $cookie);
    http3d_assert($status === 403, 'Wrong PIN must not unlock estimates.');
    http3d_assert($pin('FIXTURE_PIN', 'wrong-csrf') === 303, 'Bad CSRF PIN request should return to quote page.');
    [$status] = http3d_request($base . '/estimate', 'POST', $design, $cookie);
    http3d_assert($status === 403, 'Bad CSRF must not unlock the quote session.');
    http3d_assert($pin('FIXTURE_PIN', $csrf) === 303, 'Valid fixture PIN should unlock the session.');
    $bad = $design; $bad['csrf']='wrong-csrf';
    [$status] = http3d_request($base . '/estimate', 'POST', $bad, $cookie);
    http3d_assert($status === 403, 'Estimate endpoint must reject bad CSRF.');
    [$status,$out] = http3d_request($base . '/estimate', 'POST', $design, $cookie);
    http3d_assert($status === 200 && ($out['estimate']['total'] ?? null) == 59.5 && isset($out['request_key']), 'Reviewed product and live 19% VAT must produce the expected estimate: HTTP ' . $status . ' ' . json_encode($out) . ' ' . (string)@file_get_contents($fixture . '/server.log'));
    http3d_assert((int)$db->query('SELECT COUNT(*) FROM website_inbox')->fetchColumn() === 0 && (int)$db->query('SELECT COUNT(*) FROM quote_estimates')->fetchColumn() === 0 && (int)$db->query('SELECT COUNT(*) FROM quote_orders')->fetchColumn() === 0, 'An estimate must not be saved.');
    $request = $design + ['request_key'=>$out['request_key'],'quote_token'=>$out['estimate']['quote_token'],'expected_cents'=>5950,'customer_name'=>'Fixture customer','email'=>'fixture@example.test','phone'=>'12345'];
    $bad = $request; $bad['csrf']='wrong-csrf';
    [$status] = http3d_request($base . '/request', 'POST', $bad, $cookie);
    http3d_assert($status === 403, 'Submission endpoint must reject bad CSRF.');
    $otherCookie = ''; [$status,$otherSession] = http3d_request($base . '/session', 'GET', null, $otherCookie);
    http3d_assert($status === 200 && $otherCookie !== $cookie, 'A separate session is required.');
    $firstCookie = $cookie; $cookie = $otherCookie;
    http3d_assert($pin('FIXTURE_PIN', $otherSession['csrf']) === 303, 'Second fixture session must be unlocked independently.');
    $otherCookie = $cookie; $cookie = $firstCookie;
    $unbound = $request; $unbound['csrf']=$otherSession['csrf'];
    [$status] = http3d_request($base . '/request', 'POST', $unbound, $otherCookie);
    http3d_assert($status === 403, 'A request key must not be usable in another session.');
    $db->exec("UPDATE quote_letter3d_products SET description='Different reviewed terms',revision=revision+1 WHERE id=1");
    [$status,$changed] = http3d_request($base . '/request', 'POST', $request, $cookie);
    http3d_assert($status === 409 && ($changed['estimate']['total'] ?? null) == 59.5, 'Changed terms must reject the old token even when the total is unchanged.');
    http3d_assert((int)$db->query('SELECT COUNT(*) FROM website_inbox')->fetchColumn() === 0, 'A stale quote must not save a request.');
    [$status,$fresh] = http3d_request($base . '/estimate', 'POST', $design, $cookie);
    http3d_assert($status === 200, 'A fresh estimate should be available.');
    $request['request_key']=$fresh['request_key']; $request['quote_token']=$fresh['estimate']['quote_token'];
    [$status,$sent] = http3d_request($base . '/request', 'POST', $request, $cookie);
    http3d_assert($status === 200 && !empty($sent['ok']), 'Valid request should save.');
    [$status,$repeat] = http3d_request($base . '/request', 'POST', $request, $cookie);
    http3d_assert($status === 200 && !empty($repeat['ok']) && (int)$db->query('SELECT COUNT(*) FROM website_inbox')->fetchColumn() === 1, 'Retry must not duplicate the request.');
    $entry = json_decode((string)$db->query('SELECT payload FROM website_inbox LIMIT 1')->fetchColumn(), true, 512, JSON_THROW_ON_ERROR);
    http3d_assert(($entry['fields']['customer_name'] ?? '') === 'Fixture customer' && ($entry['fields']['email'] ?? '') === 'fixture@example.test'
        && ($entry['fields']['phone'] ?? '') === '12345' && ($entry['fields']['service_required'] ?? '') === '3D lettering'
        && ($entry['fields']['quantity'] ?? '') === '2' && ($entry['fields']['dimensions'] ?? '') === '1000 × 500 mm'
        && ($entry['estimate']['width_mm'] ?? null) == 1000 && ($entry['estimate']['height_mm'] ?? null) == 500 && ($entry['estimate']['text'] ?? '') === "A\nB" && str_contains($entry['fields']['project_description'] ?? '', "Text: A\nB\n")
        && ($entry['estimate']['colour'] ?? '') === '#ff00aa' && ($entry['estimate']['font'] ?? '') === 'sans'
        && ($entry['estimate']['total'] ?? null) == 59.5 && $entry['uploaded_file'] === null, 'Saved inquiry must match the confirmed design and contact details.');
    [$status,$last] = http3d_request($base . '/estimate', 'POST', $design, $cookie);
    http3d_request($base . '/expire', 'POST', ['key'=>$last['request_key']], $cookie);
    $request['request_key']=$last['request_key']; $request['quote_token']=$last['estimate']['quote_token'];
    [$status] = http3d_request($base . '/request', 'POST', $request, $cookie);
    http3d_assert($status === 403 && (int)$db->query('SELECT COUNT(*) FROM website_inbox')->fetchColumn() === 1, 'Expired key must not save another request.');
    [$status,$vatOld] = http3d_request($base . '/estimate', 'POST', $design, $cookie);
    http3d_assert($status === 200, 'A VAT comparison requires a valid estimate.');
    $request['request_key']=$vatOld['request_key']; $request['quote_token']=$vatOld['estimate']['quote_token'];
    $db->exec("UPDATE quote_settings SET value='20' WHERE key='vat_percent'");
    [$status] = http3d_request($base . '/request', 'POST', $request, $cookie);
    http3d_assert($status === 409 && (int)$db->query('SELECT COUNT(*) FROM website_inbox')->fetchColumn() === 1, 'Changing VAT must reject stale confirmation without saving.');
    [$status,$vatResult] = http3d_request($base . '/estimate', 'POST', $design, $cookie);
    http3d_assert($status === 200 && ($vatResult['estimate']['total'] ?? null) == 60.0, 'A fresh estimate must use the current VAT rate.');
    $modern=$design;
    $modern['lines']=[
        ['text'=>'A','font'=>'sans','colour'=>'#ff00aa','x'=>0,'y'=>0,'rotation'=>0],
        ['text'=>'B','font'=>'script','colour'=>'#123456','side_colour'=>'#f0ab12','x'=>12,'y'=>-15,'rotation'=>25],
    ];
    [$status,$modernResult] = http3d_request($base . '/estimate', 'POST', $modern, $cookie);
    http3d_assert($status === 200 && ($modernResult['estimate']['total'] ?? null)==60.0, 'Per-line design must be priced.');
    $lineRequest=$modern+['request_key'=>$modernResult['request_key'],'quote_token'=>$modernResult['estimate']['quote_token'],'expected_cents'=>6000,'customer_name'=>'Fixture customer','email'=>'fixture@example.test','phone'=>'12345'];
    $tampered=$lineRequest; $tampered['lines'][1]['rotation']=26;
    [$status] = http3d_request($base . '/request', 'POST', $tampered, $cookie);
    http3d_assert($status===409 && (int)$db->query('SELECT COUNT(*) FROM website_inbox')->fetchColumn()===1, 'Tampering with line transforms must require fresh confirmation.');
    $tamperedSide=$lineRequest; $tamperedSide['lines'][1]['side_colour']='#f0ab13';
    [$status] = http3d_request($base . '/request', 'POST', $tamperedSide, $cookie);
    http3d_assert($status===409 && (int)$db->query('SELECT COUNT(*) FROM website_inbox')->fetchColumn()===1, 'Changing side colour must require fresh confirmation.');
    [$status,$sent] = http3d_request($base . '/request', 'POST', $lineRequest, $cookie);
    http3d_assert($status===200 && !empty($sent['ok']), 'A reviewed multi-line design should submit.');
    $saved=json_decode((string)$db->query('SELECT payload FROM website_inbox ORDER BY id DESC LIMIT 1')->fetchColumn(),true,512,JSON_THROW_ON_ERROR);
    http3d_assert(($saved['estimate']['lines'][1]['font'] ?? '')==='script' && ($saved['estimate']['lines'][1]['colour'] ?? '')==='#123456' && ($saved['estimate']['lines'][1]['side_colour'] ?? '')==='#f0ab12'
        && ($saved['estimate']['lines'][1]['x'] ?? null)==12 && ($saved['estimate']['lines'][1]['y'] ?? null)==-15 && ($saved['estimate']['lines'][1]['rotation'] ?? null)==25
        && str_contains($saved['fields']['project_description'] ?? '', 'Line 2: B | style script | front colour #123456 | side colour #f0ab12 | position 12%, -15% | rotation 25°'),
        'The structured design and readable inquiry must contain the exact confirmed line details.');
    echo "3D lettering isolated HTTP checks passed.\n";
} finally {
    proc_terminate($process); proc_close($process);
    $db = null; quote_db(['quote_db_file'=>':memory:']);
    foreach (glob($fixture . '/sessions/*') ?: [] as $f) @unlink($f);
    foreach ([$fixture . '/quote.sqlite', $fixture . '/quote.sqlite-wal', $fixture . '/quote.sqlite-shm', $fixture . '/router.php', $fixture . '/server.log', $fixture . '/lib/online_quote.php', $fixture . '/data/quote-projects.php'] as $f) if (is_file($f)) @unlink($f);
    @rmdir($fixture . '/sessions'); @rmdir($fixture . '/lib'); @rmdir($fixture . '/data'); @rmdir($fixture);
}
