<?php
declare(strict_types=1);

/** Shop-defined pricing for text-only dimensional letters. No prices are seeded. */
function letter3d_schema(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS quote_letter3d_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        setup_eur REAL NOT NULL,
        letter_eur REAL NOT NULL,
        area_eur_m2 REAL NOT NULL,
        minimum_eur REAL NOT NULL,
        min_width_mm REAL NOT NULL,
        max_width_mm REAL NOT NULL,
        min_height_mm REAL NOT NULL,
        max_height_mm REAL NOT NULL,
        max_characters INTEGER NOT NULL,
        max_quantity INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        reviewed INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
}

/** @return array<string,mixed> */
function letter3d_calculate(PDO $db, array $input, float $vatPercent): array
{
    $id = filter_var($input['product_id'] ?? null, FILTER_VALIDATE_INT, ['options'=>['min_range'=>1]]);
    $query = $db->prepare('SELECT * FROM quote_letter3d_products WHERE id=? AND enabled=1 AND reviewed=1');
    $query->execute([$id ?: 0]);
    $product = $query->fetch(PDO::FETCH_ASSOC);
    if (!$product) throw new DomainException('This lettering option is not available for an estimate yet.');

    $text = trim(is_string($input['text'] ?? null) ? $input['text'] : '');
    if ($text === '' || strlen($text) > 1000 || !preg_match('/\A[\p{L}\p{N}\p{M}\p{P}\p{Zs}]+\z/uD', $text)) {
        throw new DomainException('Enter one line of lettering using letters, numbers or punctuation.');
    }
    $compactText = preg_replace('/\s+/u', '', $text);
    $characters = is_string($compactText) ? preg_match_all('/\X/u', $compactText) : false;
    if ($characters === false) throw new DomainException('The lettering could not be read.');
    if ($characters < 1 || $characters > (int)$product['max_characters']) throw new DomainException('The lettering is outside the allowed character count.');
    $width = filter_var($input['width_mm'] ?? null, FILTER_VALIDATE_FLOAT);
    $height = filter_var($input['height_mm'] ?? null, FILTER_VALIDATE_FLOAT);
    $quantity = filter_var($input['quantity'] ?? null, FILTER_VALIDATE_INT);
    if ($width === false || $height === false || !is_finite((float)$width) || !is_finite((float)$height)
        || $width < (float)$product['min_width_mm'] || $width > (float)$product['max_width_mm']
        || $height < (float)$product['min_height_mm'] || $height > (float)$product['max_height_mm']
        || $quantity === false || $quantity < 1 || $quantity > (int)$product['max_quantity']) {
        throw new DomainException('Check the sign dimensions and quantity for this option.');
    }
    $colour = is_string($input['colour'] ?? null) ? $input['colour'] : '';
    if (!preg_match('/\A#[0-9a-fA-F]{6}\z/D', $colour)) throw new DomainException('Choose a valid lettering colour.');
    $fonts = ['sans'=>'Sans serif', 'serif'=>'Serif', 'script'=>'Script'];
    $font = is_string($input['font'] ?? null) ? $input['font'] : '';
    if (!isset($fonts[$font])) throw new DomainException('Choose a lettering style.');
    foreach (['setup_eur','letter_eur','area_eur_m2','minimum_eur'] as $field) {
        if (!is_numeric($product[$field]) || !is_finite((float)$product[$field]) || (float)$product[$field] < 0 || (float)$product[$field] > 1000000) throw new DomainException('This option needs shop review before pricing.');
    }
    if ((float)$product['letter_eur'] <= 0 && (float)$product['area_eur_m2'] <= 0) throw new DomainException('This option needs shop review before pricing.');
    if (!is_finite($vatPercent) || $vatPercent < 0 || $vatPercent > 100) throw new DomainException('Tax settings need shop review.');
    $areaM2 = (float)$width * (float)$height / 1000000;
    $subtotal = max((float)$product['minimum_eur'], (float)$product['setup_eur'] + $quantity * ($characters * (float)$product['letter_eur'] + $areaM2 * (float)$product['area_eur_m2']));
    if (!is_finite($subtotal) || $subtotal > 10000000) throw new DomainException('This project needs a custom quote.');
    $subtotal = round($subtotal, 2);
    $vat = round($subtotal * $vatPercent / 100, 2);
    // Bind a submitted request to both the design and the reviewed terms, even
    // when a settings change happens to produce the same total.
    $quoteToken = hash('sha256', json_encode([$product, $text, $font, strtolower($colour), (float)$width, (float)$height, $quantity, $vatPercent], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION));
    return ['product_id'=>(int)$product['id'], 'product_name'=>$product['name'], 'text'=>$text, 'width_mm'=>(float)$width,
        'height_mm'=>(float)$height, 'quantity'=>$quantity, 'colour'=>strtolower($colour), 'font'=>$font, 'font_name'=>$fonts[$font], 'characters'=>$characters,
        'subtotal'=>$subtotal, 'vat_percent'=>$vatPercent, 'vat'=>$vat, 'total'=>round($subtotal+$vat, 2), 'quote_token'=>$quoteToken];
}

function letter3d_vat(array $settings): float
{
    $value = $settings['vat_percent'] ?? null;
    if (!is_numeric($value) || !is_finite((float)$value) || (float)$value < 0 || (float)$value > 100) throw new DomainException('Tax settings need shop review.');
    return (float)$value;
}

/** AJAX estimate only; no draft, customer data or price is saved. */
function letter3d_handle_estimate(array $siteConfig): never
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: private, no-store');
    $respond = static function (int $status, array $data): never {
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    };
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !online_quote_unlocked()) $respond(403, ['error'=>'Private testing access is required.']);
    $raw = file_get_contents('php://input', false, null, 0, 4001);
    if (!is_string($raw) || strlen($raw) > 4000) $respond(413, ['error'=>'The request is too long.']);
    $input = json_decode($raw, true);
    if (!is_array($input) || !is_string($input['csrf'] ?? null) || !csrf_valid($input['csrf'])) $respond(403, ['error'=>'Please refresh and try again.']);
    try {
        $db = quote_db($siteConfig);
        letter3d_schema($db);
        $settings = quote_settings($siteConfig);
        $result = letter3d_calculate($db, $input, letter3d_vat($settings));
        // Request keys are short-lived and bound to this testing session.
        $keys = array_filter($_SESSION['letter3d_request_keys'] ?? [], static fn($t) => is_int($t) && $t > time()-86400);
        if (count($keys) >= 20) $keys = array_slice($keys, -19, null, true);
        $key = bin2hex(random_bytes(16)); $keys[$key] = time(); $_SESSION['letter3d_request_keys'] = $keys;
        $respond(200, ['estimate'=>$result, 'request_key'=>$key]);
    } catch (DomainException $e) {
        $respond(422, ['error'=>$e->getMessage()]);
    } catch (Throwable $e) {
        error_log('3D lettering estimate unavailable: ' . get_class($e));
        $respond(503, ['error'=>'Lettering estimates are temporarily unavailable.']);
    }
}

/** Re-price at submission and save only the confirmed request in the website inbox. */
function letter3d_handle_request(array $siteConfig): never
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: private, no-store');
    $respond = static function (int $status, array $data): never {
        http_response_code($status); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE); exit;
    };
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !online_quote_unlocked()) $respond(403, ['error'=>'Private testing access is required.']);
    $raw = file_get_contents('php://input', false, null, 0, 6001);
    if (!is_string($raw) || strlen($raw) > 6000) $respond(413, ['error'=>'The request is too long.']);
    $input = json_decode($raw, true);
    if (!is_array($input) || !is_string($input['csrf'] ?? null) || !csrf_valid($input['csrf'])) $respond(403, ['error'=>'Please refresh and try again.']);
    $key = $input['request_key'] ?? null;
    $name = trim(is_string($input['customer_name'] ?? null) ? $input['customer_name'] : '');
    $email = trim(is_string($input['email'] ?? null) ? $input['email'] : '');
    $phone = trim(is_string($input['phone'] ?? null) ? $input['phone'] : '');
    $expected = filter_var($input['expected_cents'] ?? null, FILTER_VALIDATE_INT, ['options'=>['min_range'=>0,'max_range'=>1000000000]]);
    $token = $input['quote_token'] ?? null;
    if (!is_string($key) || !preg_match('/\A[a-f0-9]{32}\z/D', $key) || $name === '' || mb_strlen($name) > 200
        || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254 || $phone === '' || mb_strlen($phone) > 60
        || preg_match('/[\r\n\x00-\x1f]/', $name.$email.$phone) || $expected === false || !is_string($token) || !preg_match('/\A[a-f0-9]{64}\z/D', $token)) {
        $respond(422, ['error'=>'Enter a name, valid email and phone number, then review the current estimate.']);
    }
    $keyTime = $_SESSION['letter3d_request_keys'][$key] ?? null;
    if (!is_int($keyTime) || $keyTime <= time()-86400) $respond(403, ['error'=>'Your quote session expired. Recalculate and try again.']);
    try {
        $db = quote_db($siteConfig); letter3d_schema($db);
        $db->exec('BEGIN IMMEDIATE');
        try {
            $exists = $db->prepare('SELECT 1 FROM website_inbox WHERE legacy_key=? AND kind=?');
            $requestKey = 'letter3d:' . $key;
            $exists->execute([$requestKey,'inquiry']);
            if ($exists->fetchColumn()) { $db->exec('COMMIT'); $respond(200, ['ok'=>true, 'message'=>'Your request was already received.']); }
            $settings = quote_settings($siteConfig);
            $estimate = letter3d_calculate($db, $input, letter3d_vat($settings));
            if ((int)round($estimate['total'] * 100) !== $expected || !hash_equals($estimate['quote_token'], $token)) {
                $db->exec('ROLLBACK');
                $respond(409, ['error'=>'The price has changed. Please review the updated estimate before sending.', 'estimate'=>$estimate]);
            }
            $summary = "Text: {$estimate['text']}\nOption: {$estimate['product_name']}\nStyle: {$estimate['font_name']} (preview only)\nSize: {$estimate['width_mm']} × {$estimate['height_mm']} mm\nQuantity: {$estimate['quantity']}\nColour: {$estimate['colour']}\nPreliminary estimate including VAT: €" . number_format($estimate['total'], 2, '.', '');
            $entry = ['submitted_at'=>date('c'), 'fields'=>['customer_name'=>$name, 'email'=>$email, 'phone'=>$phone,
                'service_required'=>'3D lettering', 'project_description'=>$summary,
                'dimensions'=>$estimate['width_mm'].' × '.$estimate['height_mm'].' mm', 'quantity'=>(string)$estimate['quantity']], 'uploaded_file'=>null, 'estimate'=>$estimate];
            website_save_message($db, 'inquiry', $entry, $requestKey);
            $db->exec('COMMIT');
            $respond(200, ['ok'=>true, 'message'=>'Your request has been received for shop review.']);
        } catch (Throwable $e) { if ($db->inTransaction()) $db->exec('ROLLBACK'); throw $e; }
    } catch (DomainException $e) {
        $respond(422, ['error'=>$e->getMessage()]);
    } catch (Throwable $e) {
        error_log('3D lettering request unavailable: ' . get_class($e));
        $respond(503, ['error'=>'Your request could not be saved. Please try again.']);
    }
}
