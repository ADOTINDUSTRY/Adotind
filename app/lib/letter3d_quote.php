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

/** Shop-provided baseline; this is a request snapshot, not a production drawing. */
function letter3d_construction_standard(): array
{
    return [
        'version' => 1,
        'front' => ['material'=>'white opal acrylic', 'thickness_mm'=>3.0, 'offset_outside_mm'=>1.0],
        'side' => ['material'=>'aluminium', 'thickness_mm'=>0.6, 'acrylic_groove_depth_mm'=>1.2],
        'back' => ['material'=>'white PVC', 'thickness_mm'=>10.0],
        'front_and_side_film' => 'Avery Dennison 500 Event Film',
        'status' => 'shop standard; film and lighting compatibility subject to production review',
    ];
}

/** @return array<string,mixed> */
function letter3d_calculate(PDO $db, array $input, float $vatPercent): array
{
    $id = filter_var($input['product_id'] ?? null, FILTER_VALIDATE_INT, ['options'=>['min_range'=>1]]);
    $query = $db->prepare('SELECT * FROM quote_letter3d_products WHERE id=? AND enabled=1 AND reviewed=1');
    $query->execute([$id ?: 0]);
    $product = $query->fetch(PDO::FETCH_ASSOC);
    if (!$product) throw new DomainException('This lettering option is not available for an estimate yet.');

    $fonts = ['sans'=>'Sans serif', 'serif'=>'Serif', 'script'=>'Script'];
    // New workspaces send individual line styles and transforms. Older tabs
    // continue to send plain newline-delimited text with one font and colour.
    if (array_key_exists('lines', $input)) {
        $rawLines = $input['lines'];
        if (!is_array($rawLines) || !array_is_list($rawLines) || count($rawLines) < 1 || count($rawLines) > 8) {
            throw new DomainException('Enter between one and eight lines.');
        }
    } else {
        $legacyText = trim(str_replace(["\r\n", "\r"], "\n", is_string($input['text'] ?? null) ? $input['text'] : ''));
        $rawLines = array_map(static fn($line) => ['text'=>$line, 'font'=>$input['font'] ?? null, 'colour'=>$input['colour'] ?? null,
            'x'=>0, 'y'=>0, 'rotation'=>0], explode("\n", $legacyText));
        if (count($rawLines) > 8) throw new DomainException('Enter between one and eight lines.');
    }
    $lines = []; $characters = 0; $bytes = 0;
    foreach ($rawLines as $rawLine) {
        if (!is_array($rawLine) || !is_string($rawLine['text'] ?? null)) throw new DomainException('Enter valid lettering for each line.');
        $lineText = $rawLine['text']; $bytes += strlen($lineText);
        if ($bytes > 1000 || !preg_match('/\A[\p{L}\p{N}\p{M}\p{P}\p{Zs}]*\z/uD', $lineText)) {
            throw new DomainException('Use letters, numbers or punctuation in each line.');
        }
        $font = $rawLine['font'] ?? null; $colour = $rawLine['colour'] ?? null;
        if (!is_string($font) || !isset($fonts[$font])) throw new DomainException('Choose a lettering style for each line.');
        if (!is_string($colour) || !preg_match('/\A#[0-9a-fA-F]{6}\z/D', $colour)) throw new DomainException('Choose a valid front colour for each line.');
        // Missing/null side colour keeps the pre-existing automatic shading.
        $sideColour = $rawLine['side_colour'] ?? null;
        if ($sideColour !== null && (!is_string($sideColour) || !preg_match('/\A#[0-9a-fA-F]{6}\z/D', $sideColour))) {
            throw new DomainException('Choose a valid side colour for each line.');
        }
        if (is_string($sideColour)) $sideColour = strtolower($sideColour);
        // Earlier workspaces did not collect finish. A missing value remains
        // unspecified; do not silently claim the customer chose a finish.
        $finishes = [];
        foreach (['front_finish', 'side_finish'] as $field) {
            $finish = $rawLine[$field] ?? null;
            if ($finish !== null && (!is_string($finish) || !in_array($finish, ['matt', 'gloss'], true))) {
                throw new DomainException('Choose matt or gloss for each selected finish.');
            }
            if ($finish !== null) $finishes[$field] = $finish;
        }
        $transforms = [];
        foreach (['x'=>200, 'y'=>200, 'rotation'=>180] as $key=>$limit) {
            $number = filter_var($rawLine[$key] ?? null, FILTER_VALIDATE_FLOAT);
            if ($number === false || !is_finite((float)$number) || abs((float)$number) > $limit) throw new DomainException('Check the position and rotation of each line.');
            $transforms[$key] = (float)$number === 0.0 ? 0.0 : (float)$number;
        }
        $compact = preg_replace('/\s+/u', '', $lineText);
        $count = is_string($compact) ? preg_match_all('/\X/u', $compact) : false;
        if ($count === false) throw new DomainException('The lettering could not be read.');
        $characters += $count;
        $lines[] = ['text'=>$lineText, 'font'=>$font, 'colour'=>strtolower($colour), 'side_colour'=>$sideColour, 'x'=>$transforms['x'], 'y'=>$transforms['y'], 'rotation'=>$transforms['rotation']] + $finishes;
    }
    $text = implode("\n", array_column($lines, 'text'));
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
    $font = $lines[0]['font']; $colour = $lines[0]['colour'];
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
    // Auto side colour has the same meaning as before this option existed.
    // Omitting it from token material preserves a pending legacy confirmation.
    $tokenLines = array_map(static function (array $line): array {
        if ($line['side_colour'] === null) unset($line['side_colour']);
        return $line;
    }, $lines);
    $construction = letter3d_construction_standard();
    $tokenData = [$product, $tokenLines, (float)$width, (float)$height, $quantity, $vatPercent];
    // Bind the standard once a new workspace sends a finish, while preserving
    // the exact token of a legacy estimate which did not collect finishes.
    if (array_filter($lines, static fn(array $line): bool => isset($line['front_finish']) || isset($line['side_finish']))) {
        $tokenData[] = $construction;
    }
    $quoteToken = hash('sha256', json_encode($tokenData, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION));
    return ['product_id'=>(int)$product['id'], 'product_name'=>$product['name'], 'text'=>$text, 'width_mm'=>(float)$width,
        'height_mm'=>(float)$height, 'quantity'=>$quantity, 'colour'=>$colour, 'font'=>$font, 'font_name'=>$fonts[$font], 'lines'=>$lines, 'characters'=>$characters,
        'construction'=>$construction, 'subtotal'=>$subtotal, 'vat_percent'=>$vatPercent, 'vat'=>$vat, 'total'=>round($subtotal+$vat, 2), 'quote_token'=>$quoteToken];
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
            $lineSummary = [];
            foreach ($estimate['lines'] as $index => $line) {
                $sideDescription = $line['side_colour'] ?? 'automatic shade of front';
                $lineSummary[] = sprintf('Line %d: %s | style %s | front colour %s | side colour %s | position %s%%, %s%% | rotation %s° | front film finish %s | side film finish %s',
                    $index + 1, $line['text'], $line['font'], $line['colour'], $sideDescription, $line['x'], $line['y'], $line['rotation'],
                    $line['front_finish'] ?? 'not specified', $line['side_finish'] ?? 'not specified');
            }
            $summary = "Text: {$estimate['text']}\nOption: {$estimate['product_name']}\n" . implode("\n", $lineSummary)
                . "\nSize: {$estimate['width_mm']} × {$estimate['height_mm']} mm\nQuantity: {$estimate['quantity']}"
                . "\nShop construction standard (including film/lighting compatibility, subject to production review): 3 mm white opal acrylic front, 1 mm outside offset; 0.6 mm aluminium side in 1.2 mm deep acrylic groove; 10 mm white PVC back; Avery Dennison 500 Event Film on front and sides."
                . "\nPreliminary estimate including VAT: €" . number_format($estimate['total'], 2, '.', '');
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
