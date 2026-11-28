<?php
declare(strict_types=1);

/** Rectangular decorative/display frame profiles. No rates are seeded. */
function frame_quote_schema(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS quote_frame_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      max_width_mm INTEGER NOT NULL, max_height_mm INTEGER NOT NULL, max_quantity INTEGER NOT NULL,
      price_per_m_cents INTEGER NOT NULL, corner_cents INTEGER NOT NULL, setup_cents INTEGER NOT NULL, minimum_cents INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 0, shop_reviewed INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
}
function frame_mm10(mixed $value): int
{
    if (!is_scalar($value) || !preg_match('/\A([0-9]{1,4})(?:\.([0-9]))?\z/D',(string)$value,$m)) throw new DomainException('Enter millimetres to one decimal place.');
    $v=(int)$m[1]*10+(int)($m[2] ?? 0);
    if ($v<10 || $v>50000) throw new DomainException('Each dimension must be between 1 and 5,000 mm.');
    return $v;
}
function frame_quote_products(PDO $db): array
{
    frame_quote_schema($db);
    return $db->query('SELECT id,name,description,max_width_mm,max_height_mm,max_quantity FROM quote_frame_profiles WHERE active=1 AND shop_reviewed=1 ORDER BY name,id')->fetchAll(PDO::FETCH_ASSOC);
}
function frame_quote_compute(PDO $db,array $input): array
{
    frame_quote_schema($db);
    $id=filter_var($input['profile_id'] ?? null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    $qty=filter_var($input['quantity'] ?? null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>1000]]);
    if (!$id || !$qty) throw new DomainException('Choose a frame profile and a valid quantity.');
    $w=frame_mm10($input['width_mm'] ?? null); $h=frame_mm10($input['height_mm'] ?? null);
    $q=$db->prepare('SELECT * FROM quote_frame_profiles WHERE id=? AND active=1 AND shop_reviewed=1');$q->execute([$id]);$p=$q->fetch(PDO::FETCH_ASSOC);
    if (!$p) throw new DomainException('This frame profile is not configured for an instant estimate.');
    if ((int)$p['max_width_mm']<1 || (int)$p['max_width_mm']>5000 || (int)$p['max_height_mm']<1 || (int)$p['max_height_mm']>5000 || (int)$p['max_quantity']<1 || (int)$p['max_quantity']>1000 || $w>(int)$p['max_width_mm']*10 || $h>(int)$p['max_height_mm']*10 || $qty>(int)$p['max_quantity']) throw new DomainException('This size or quantity needs shop review.');
    foreach (['price_per_m_cents','corner_cents','setup_cents','minimum_cents'] as $key) if (!is_numeric($p[$key]) || (int)$p[$key]<0 || (int)$p[$key]>1000000) throw new DomainException('This profile needs pricing review.');
    if ((int)$p['price_per_m_cents']<=0) throw new DomainException('This profile needs pricing review.');
    // 0.1 mm units: 10,000 units per metre. Round material charge up to a cent.
    $perimeter=2*($w+$h)*$qty; $numerator=$perimeter*(int)$p['price_per_m_cents'];
    if (!is_int($numerator)) throw new DomainException('This quantity needs manual review.');
    $profileCents=intdiv($numerator,10000)+($numerator%10000>0?1:0);
    $corners=4*$qty*(int)$p['corner_cents'];
    $subtotal=max((int)$p['minimum_cents'],$profileCents+$corners+(int)$p['setup_cents']);
    $vat=$db->query("SELECT value FROM quote_settings WHERE key='vat_percent'")->fetchColumn();
    if (!is_string($vat) || !preg_match('/\A(?:[0-9]{1,2}|100)(?:\.[0-9]{1,2})?\z/D',$vat) || (float)$vat>100) throw new DomainException('Tax settings need shop review.');
    $tax=intdiv($subtotal*(int)round((float)$vat*100)+5000,10000);
    return ['profile_id'=>(int)$p['id'],'profile'=>(string)$p['name'],'revision'=>(int)$p['revision'],'width_mm'=>$w/10,'height_mm'=>$h/10,'quantity'=>$qty,
      'profile_length_m'=>$perimeter/10000,'corners'=>4*$qty,'subtotal_cents'=>$subtotal,'vat_cents'=>$tax,'total_cents'=>$subtotal+$tax];
}
function frame_quote_json(int $code,array $body): never
{
    http_response_code($code); header('Content-Type: application/json; charset=utf-8');header('Cache-Control: private, no-store');header('X-Content-Type-Options: nosniff');
    echo json_encode($body,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);exit;
}
function frame_quote_request(PDO $db,array $data,array &$session): array
{
    $key=$data['request_key'] ?? null;
    if (!is_string($key) || !preg_match('/\A[a-f0-9]{32}\z/D',$key) || !is_int($session['frame_request_keys'][$key] ?? null) || $session['frame_request_keys'][$key]<time()-86400 || $session['frame_request_keys'][$key]>time()+60) throw new DomainException('Please reload the designer and try again.');
    $fields=[];
    foreach (['customer_name'=>100,'email'=>254,'phone'=>60,'notes'=>1200] as $field=>$max) {
        $value=$data[$field] ?? '';
        if (!is_string($value) || mb_strlen($value)>$max || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/',$value)) throw new DomainException('Check the contact details and project note.');
        $fields[$field]=trim($value);
    }
    if ($fields['customer_name']==='' || $fields['phone']==='' || !filter_var($fields['email'],FILTER_VALIDATE_EMAIL)) throw new DomainException('Enter your name, valid email and phone number.');
    $expected=filter_var($data['expected_total_cents'] ?? null,FILTER_VALIDATE_INT,['options'=>['min_range'=>0]]);
    $revision=filter_var($data['expected_revision'] ?? null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if ($expected===false || $revision===false) throw new DomainException('Please review the current price.');
    $legacy='frame-request:'.$key;$db->exec('BEGIN IMMEDIATE');
    try {
        $old=$db->prepare('SELECT id FROM website_inbox WHERE legacy_key=?');$old->execute([$legacy]);
        if ($id=$old->fetchColumn()) { $db->exec('COMMIT'); return ['id'=>(int)$id,'duplicate'=>true]; }
        $quote=frame_quote_compute($db,$data);
        if ($quote['total_cents']!==$expected || $quote['revision']!==$revision) { $db->exec('ROLLBACK'); return ['changed'=>true,'quote'=>$quote]; }
        $desc=sprintf("Rectangular decorative frame: %s\nOutside dimensions: %s × %s mm\nQuantity: %d\nFour corner joins per frame; no crossbars.\nEstimated total incl. VAT: €%s\nNot assessed for load-bearing or structural use.\n%s",$quote['profile'],$quote['width_mm'],$quote['height_mm'],$quote['quantity'],number_format($quote['total_cents']/100,2,'.',''),$fields['notes']);
        $entry=['submitted_at'=>date('c'),'fields'=>['customer_name'=>$fields['customer_name'],'company_name'=>'','email'=>$fields['email'],'phone'=>$fields['phone'],'service_required'=>'Rectangular frame','project_description'=>$desc,'dimensions'=>$quote['width_mm'].' × '.$quote['height_mm'].' mm','material'=>$quote['profile'],'quantity'=>(string)$quote['quantity']],'uploaded_file'=>null,'frame_quote'=>$quote];
        $q=$db->prepare("INSERT INTO website_inbox(kind,submitted_at,payload,legacy_key) VALUES('inquiry',?,?,?)");$q->execute([$entry['submitted_at'],json_encode($entry,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE),$legacy]);
        $id=(int)$db->lastInsertId();$db->exec('COMMIT');return ['id'=>$id,'duplicate'=>false];
    } catch (Throwable $e) { try { $db->exec('ROLLBACK'); } catch (Throwable $ignored) {} throw $e; }
}
function frame_quote_handle(array $config): never
{
    if (!online_quote_unlocked()) frame_quote_json(403,['error'=>'Private testing access is required.']);
    try {
        $db=quote_db($config);
        if (($_SERVER['REQUEST_METHOD'] ?? '')==='GET') frame_quote_json(200,['profiles'=>frame_quote_products($db)]);
        if (($_SERVER['REQUEST_METHOD'] ?? '')!=='POST') frame_quote_json(405,['error'=>'Unsupported request.']);
        $raw=file_get_contents('php://input',false,null,0,4097);if (!is_string($raw) || strlen($raw)>4096) frame_quote_json(413,['error'=>'Request is too large.']);
        $data=json_decode($raw,true);if (!is_array($data) || !is_string($data['csrf'] ?? null) || !csrf_valid($data['csrf'])) frame_quote_json(403,['error'=>'Please refresh and try again.']);
        if (($data['action'] ?? '')==='estimate') frame_quote_json(200,['quote'=>frame_quote_compute($db,$data)]);
        if (($data['action'] ?? '')==='request') { $result=frame_quote_request($db,$data,$_SESSION);frame_quote_json(!empty($result['changed'])?409:200,$result); }
        frame_quote_json(400,['error'=>'Unsupported request.']);
    } catch (DomainException $e) { frame_quote_json(422,['error'=>$e->getMessage()]); }
      catch (Throwable $e) { error_log('Frame estimate unavailable: '.get_class($e));frame_quote_json(503,['error'=>'Frame estimates are temporarily unavailable.']); }
}
