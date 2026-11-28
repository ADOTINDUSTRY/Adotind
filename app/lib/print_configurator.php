<?php
declare(strict_types=1);

/** Printing products have no seed prices. The shop must configure and review each one. */
function print_quote_schema(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS quote_print_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        max_width_mm INTEGER NOT NULL, max_height_mm INTEGER NOT NULL,
        price_per_m2_cents INTEGER NOT NULL, laminate_per_m2_cents INTEGER,
        setup_cents INTEGER NOT NULL, minimum_cents INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 0, shop_reviewed INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
}

function print_quote_public_products(PDO $db): array
{
    print_quote_schema($db);
    return $db->query('SELECT id,name,description,max_width_mm,max_height_mm,laminate_per_m2_cents FROM quote_print_products WHERE active=1 AND shop_reviewed=1 ORDER BY name,id')->fetchAll(PDO::FETCH_ASSOC);
}

/** Accept sizes to one tenth mm without float rounding and bound all arithmetic. */
function print_quote_mm10(mixed $value): int
{
    if (!is_scalar($value) || !preg_match('/\A([0-9]{1,4})(?:\.([0-9]))?\z/D', (string)$value, $m)) throw new DomainException('Enter a size in millimetres, to one decimal place.');
    $n = (int)$m[1]*10 + (int)($m[2] ?? 0);
    if ($n < 10 || $n > 50000) throw new DomainException('Size must be between 1 and 5,000 mm.');
    return $n;
}

function print_quote_compute(PDO $db, array $input): array
{
    print_quote_schema($db);
    $id = filter_var($input['product_id'] ?? null, FILTER_VALIDATE_INT, ['options'=>['min_range'=>1]]);
    $qty = filter_var($input['quantity'] ?? null, FILTER_VALIDATE_INT, ['options'=>['min_range'=>1,'max_range'=>1000]]);
    if ($id === false || $qty === false) throw new DomainException('Choose a print product and quantity from 1 to 1,000.');
    $w=print_quote_mm10($input['width_mm'] ?? null); $h=print_quote_mm10($input['height_mm'] ?? null);
    $laminate = $input['laminate'] ?? false;
    if (!in_array($laminate, [true,false,0,1,'0','1'], true)) throw new DomainException('Choose a valid finish.');
    $laminate = $laminate === true || $laminate === 1 || $laminate === '1';
    $q=$db->prepare('SELECT * FROM quote_print_products WHERE id=? AND active=1 AND shop_reviewed=1'); $q->execute([$id]);
    $product=$q->fetch(PDO::FETCH_ASSOC);
    if (!$product) throw new DomainException('This print product is not configured for an instant estimate. Please contact us.');
    if ((int)$product['max_width_mm'] < 1 || (int)$product['max_width_mm'] > 5000 || (int)$product['max_height_mm'] < 1 || (int)$product['max_height_mm'] > 5000 || $w > (int)$product['max_width_mm']*10 || $h > (int)$product['max_height_mm']*10) throw new DomainException('This size needs shop review. Please contact us.');
    foreach (['price_per_m2_cents','setup_cents','minimum_cents'] as $key) {
        if (!is_numeric($product[$key]) || (int)$product[$key]<0 || (int)$product[$key]>1000000) throw new DomainException('This product needs a pricing review.');
    }
    if ((int)$product['price_per_m2_cents'] <= 0) throw new DomainException('This product needs a pricing review.');
    if ($laminate && ($product['laminate_per_m2_cents'] === null || !is_numeric($product['laminate_per_m2_cents']) || (int)$product['laminate_per_m2_cents'] < 0 || (int)$product['laminate_per_m2_cents'] > 1000000)) throw new DomainException('Lamination is not configured for this product.');
    $sqRate=(int)$product['price_per_m2_cents'] + ($laminate ? (int)$product['laminate_per_m2_cents'] : 0);
    // Dimensions are in 0.1 mm: one square metre is 100,000,000 units.
    $numerator=$w*$h*$qty*$sqRate;
    if (!is_int($numerator) || $numerator < 0) throw new DomainException('This quantity needs a manual quotation.');
    $areaCents=intdiv($numerator,100000000) + (($numerator%100000000) > 0 ? 1 : 0);
    $subtotal=max((int)$product['minimum_cents'], $areaCents + (int)$product['setup_cents']);
    $tax=$db->query("SELECT value FROM quote_settings WHERE key='vat_percent'")->fetchColumn();
    if (!is_string($tax) || !preg_match('/\A(?:[0-9]{1,2}|100)(?:\.[0-9]{1,2})?\z/D', $tax) || (float)$tax>100) throw new DomainException('Tax settings need shop review before estimating.');
    $taxBasis=(int)round((float)$tax*100);
    $taxCents=intdiv($subtotal*$taxBasis+5000,10000);
    return ['product_id'=>(int)$product['id'],'product'=>(string)$product['name'],'revision'=>(int)$product['revision'],
        'width_mm'=>$w/10,'height_mm'=>$h/10,'quantity'=>$qty,'laminate'=>$laminate,
        'area_m2'=>($w*$h*$qty)/100000000,'subtotal_cents'=>$subtotal,'vat_cents'=>$taxCents,'total_cents'=>$subtotal+$taxCents];
}

function print_quote_json(int $status, array $result): never
{
    http_response_code($status); header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: private, no-store'); header('X-Content-Type-Options: nosniff');
    echo json_encode($result,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE); exit;
}

/** Create a request only after an explicit price confirmation. */
function print_quote_request(PDO $db, array $data, array &$session, ?array $upload=null, ?string $uploadDirectory=null): array
{
    $key=$data['request_key'] ?? null;
    if (!is_string($key) || !preg_match('/\A[a-f0-9]{32}\z/D',$key) || !is_int($session['print_request_keys'][$key] ?? null)
        || $session['print_request_keys'][$key] < time()-86400 || $session['print_request_keys'][$key] > time()+60) throw new DomainException('Please reload the designer and try again.');
    $fields=[];
    foreach (['customer_name'=>100,'email'=>254,'phone'=>60,'notes'=>1200] as $field=>$limit) {
        $value=$data[$field] ?? '';
        if (!is_string($value) || mb_strlen($value)>$limit || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/',$value)) throw new DomainException('Check your contact details and project note.');
        $fields[$field]=trim($value);
    }
    if ($fields['customer_name']==='' || $fields['phone']==='' || !filter_var($fields['email'],FILTER_VALIDATE_EMAIL)) throw new DomainException('Enter your name, valid email address and phone number.');
    $expected=filter_var($data['expected_total_cents'] ?? null,FILTER_VALIDATE_INT,['options'=>['min_range'=>0]]);
    $revision=filter_var($data['expected_revision'] ?? null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if ($expected===false || $revision===false) throw new DomainException('Please check the latest price before sending.');
    $legacy='print-request:'.$key;
    $savedFile=null;
    $db->exec('BEGIN IMMEDIATE');
    try {
        $prior=$db->prepare('SELECT id FROM website_inbox WHERE legacy_key=?'); $prior->execute([$legacy]);
        if ($id=$prior->fetchColumn()) { $db->exec('COMMIT'); return ['id'=>(int)$id,'duplicate'=>true]; }
        $quote=print_quote_compute($db,$data);
        if ($quote['total_cents']!==$expected || $quote['revision']!==$revision) { $db->exec('ROLLBACK'); return ['changed'=>true,'quote'=>$quote]; }
        $filename=null;
        if ($upload !== null && (int)($upload['error'] ?? -1) !== UPLOAD_ERR_NO_FILE) {
            if ((int)($upload['error'] ?? -1) !== UPLOAD_ERR_OK || !is_string($upload['tmp_name'] ?? null) || !is_uploaded_file($upload['tmp_name'])) throw new DomainException('The artwork could not be uploaded. Please choose it again.');
            $size=(int)($upload['size'] ?? 0); $ext=strtolower(pathinfo((string)($upload['name'] ?? ''),PATHINFO_EXTENSION));
            if ($size < 1 || $size > 10*1024*1024 || !in_array($ext,['pdf','jpg','jpeg','png','webp'],true)) throw new DomainException('Use a PDF, JPG, PNG or WebP file up to 10 MB.');
            if ($ext==='pdf') {
                $handle=fopen($upload['tmp_name'],'rb'); $magic=$handle ? fread($handle,5) : false; if ($handle) fclose($handle);
                if ($magic !== '%PDF-') throw new DomainException('The selected PDF is not valid.');
            } else {
                $info=@getimagesize($upload['tmp_name']); $expected=['jpg'=>'image/jpeg','jpeg'=>'image/jpeg','png'=>'image/png','webp'=>'image/webp'];
                if (!is_array($info) || ($info['mime'] ?? '') !== $expected[$ext]) throw new DomainException('The selected image is not valid.');
            }
            if (!is_string($uploadDirectory) || !is_dir($uploadDirectory) || !is_writable($uploadDirectory)) throw new RuntimeException('Print request storage unavailable');
            $filename=gmdate('Ymd-His').'-'.bin2hex(random_bytes(6)).'.'.$ext;
            $target=rtrim($uploadDirectory,'/\\').DIRECTORY_SEPARATOR.$filename;
            if (file_exists($target) || !move_uploaded_file($upload['tmp_name'],$target)) throw new RuntimeException('Print artwork could not be saved');
            $savedFile=$target;
        }
        $description=sprintf("Printing estimate: %s\nSize: %s × %s mm\nQuantity: %d\nLamination: %s\nEstimated total including VAT: €%s\n%s\n%s",
            $quote['product'], $quote['width_mm'], $quote['height_mm'], $quote['quantity'], $quote['laminate']?'Yes':'No', number_format($quote['total_cents']/100,2,'.',''), $filename ? 'Artwork attached for review.' : 'Artwork to be confirmed with customer.', $fields['notes']);
        $entry=['submitted_at'=>date('c'),'fields'=>['customer_name'=>$fields['customer_name'],'company_name'=>'','email'=>$fields['email'],'phone'=>$fields['phone'],'service_required'=>'Printing and graphics','project_description'=>$description,'dimensions'=>$quote['width_mm'].' × '.$quote['height_mm'].' mm','material'=>$quote['product'],'quantity'=>(string)$quote['quantity']], 'uploaded_file'=>$filename,'print_quote'=>$quote];
        $q=$db->prepare("INSERT INTO website_inbox(kind,submitted_at,payload,legacy_key) VALUES('inquiry',?,?,?)");
        $q->execute([$entry['submitted_at'],json_encode($entry,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE),$legacy]);
        $id=(int)$db->lastInsertId(); $db->exec('COMMIT'); return ['id'=>$id,'duplicate'=>false];
    } catch (Throwable $e) {
        try { $db->exec('ROLLBACK'); } catch (Throwable $ignored) {}
        if ($savedFile !== null && is_file($savedFile) && !@unlink($savedFile)) error_log('Could not remove failed print-request upload');
        throw $e;
    }
}

/** HTTP endpoint: only the actual configured product, dimensions and quantity determine price. */
function print_quote_handle(array $siteConfig): never
{
    if (!online_quote_unlocked()) print_quote_json(403,['error'=>'Private testing access is required.']);
    try {
        $db=quote_db($siteConfig);
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') { print_quote_json(200,['products'=>print_quote_public_products($db)]); }
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') print_quote_json(405,['error'=>'Unsupported request.']);
        $multipart=str_starts_with(strtolower((string)($_SERVER['CONTENT_TYPE'] ?? '')),'multipart/form-data;');
        if ($multipart) {
            if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 12*1024*1024) print_quote_json(413,['error'=>'Request is too large.']);
            $data=$_POST;
        } else {
            $raw=file_get_contents('php://input',false,null,0,4097);
            if (!is_string($raw) || strlen($raw)>4096) print_quote_json(413,['error'=>'Request is too large.']);
            $data=json_decode($raw,true);
        }
        if (!is_array($data) || !is_string($data['csrf'] ?? null) || !csrf_valid($data['csrf'])) print_quote_json(403,['error'=>'Please refresh and try again.']);
        if (($data['action'] ?? '') === 'request') {
            $result=print_quote_request($db,$data,$_SESSION,$multipart && is_array($_FILES['artwork'] ?? null) ? $_FILES['artwork'] : null, $siteConfig['inquiries_dir'] ?? null);
            print_quote_json(!empty($result['changed']) ? 409 : 200,$result);
        }
        if (($data['action'] ?? '') !== 'estimate') print_quote_json(400,['error'=>'Unsupported request.']);
        print_quote_json(200,['quote'=>print_quote_compute($db,$data)]);
    } catch (DomainException $e) { print_quote_json(422,['error'=>$e->getMessage()]); }
      catch (Throwable $e) { error_log('Print quote unavailable: '.get_class($e)); print_quote_json(503,['error'=>'Printing estimates are temporarily unavailable.']); }
}
