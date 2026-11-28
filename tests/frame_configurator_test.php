<?php
declare(strict_types=1);
require __DIR__.'/../app/lib/frame_configurator.php';
function check(bool $ok,string $message):void { if (!$ok) throw new RuntimeException($message); }
function rejected(callable $fn):void { try { $fn(); } catch (DomainException $e) { return; } throw new RuntimeException('Expected rejection'); }
$db=new PDO('sqlite::memory:');$db->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
$db->exec("CREATE TABLE quote_settings(key TEXT PRIMARY KEY,value TEXT); INSERT INTO quote_settings VALUES('vat_percent','19'); CREATE TABLE website_inbox(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT,submitted_at TEXT,payload TEXT,legacy_key TEXT UNIQUE)");
check(frame_quote_products($db)===[],'No rates should be seeded');
$db->exec("INSERT INTO quote_frame_profiles(name,description,max_width_mm,max_height_mm,max_quantity,price_per_m_cents,corner_cents,setup_cents,minimum_cents,active,shop_reviewed) VALUES('Profile','',2000,1500,10,1000,200,500,100,1,0)");
$in=['profile_id'=>1,'width_mm'=>'1000','height_mm'=>'500','quantity'=>2];
rejected(fn()=>frame_quote_compute($db,$in));
$db->exec('UPDATE quote_frame_profiles SET shop_reviewed=1');
$quote=frame_quote_compute($db,$in);
// 6 m × €10 + 8 corners × €2 + €5 setup = €81, plus 19% VAT.
check($quote['subtotal_cents']===8100 && $quote['total_cents']===9639,'Price calculation');
rejected(fn()=>frame_quote_compute($db,array_merge($in,['width_mm'=>'2001'])));
rejected(fn()=>frame_quote_compute($db,array_merge($in,['quantity'=>'1.5'])));
$key=str_repeat('a',32);$session=['frame_request_keys'=>[$key=>time()]];
$request=array_merge($in,['request_key'=>$key,'expected_total_cents'=>9639,'expected_revision'=>1,'customer_name'=>'Test','email'=>'test@example.com','phone'=>'123','notes'=>'Example']);
$db->exec('UPDATE quote_frame_profiles SET revision=2');$changed=frame_quote_request($db,$request,$session);
check(!empty($changed['changed']) && (int)$db->query('SELECT COUNT(*) FROM website_inbox')->fetchColumn()===0,'Changed terms require reconfirmation');
$request['expected_revision']=2;$sent=frame_quote_request($db,$request,$session);$again=frame_quote_request($db,$request,$session);
check($sent['id']===$again['id'] && $again['duplicate']===true,'Idempotent request');
$expired=['frame_request_keys'=>[$key=>time()-86401]];rejected(fn()=>frame_quote_request($db,$request,$expired));
$db->exec("UPDATE quote_settings SET value='unknown' WHERE key='vat_percent'");rejected(fn()=>frame_quote_compute($db,$in));
echo "Frame calculation and request checks passed.\n";
