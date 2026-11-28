<?php
declare(strict_types=1);
require __DIR__ . '/../app/lib/print_configurator.php';
function check(bool $ok,string $message): void { if (!$ok) throw new RuntimeException($message); }
function rejects(callable $fn): bool { try { $fn(); return false; } catch (DomainException $e) { return true; } }
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$db->exec("CREATE TABLE quote_settings (key TEXT PRIMARY KEY,value TEXT); INSERT INTO quote_settings VALUES('vat_percent','19'); CREATE TABLE website_inbox (id INTEGER PRIMARY KEY,kind TEXT,submitted_at TEXT,payload TEXT,legacy_key TEXT UNIQUE)");
print_quote_schema($db);
check(print_quote_public_products($db)===[],'No prices should be created by default');
$db->exec("INSERT INTO quote_print_products(name,description,max_width_mm,max_height_mm,price_per_m2_cents,laminate_per_m2_cents,setup_cents,minimum_cents,active,shop_reviewed) VALUES('Vinyl','Print only',1400,3000,1000,400,200,800,1,0)");
$v=['product_id'=>'1','width_mm'=>'500','height_mm'=>'500','quantity'=>'2','laminate'=>false];
check(rejects(fn()=>print_quote_compute($db,$v)),'Unreviewed price must not be offered');
$db->exec('UPDATE quote_print_products SET shop_reviewed=1, revision=2 WHERE id=1');
$q=print_quote_compute($db,$v);
check($q['subtotal_cents']===800 && $q['vat_cents']===152 && $q['total_cents']===952,'Minimum price and VAT');
$v['laminate']=true;$q=print_quote_compute($db,$v);
check($q['subtotal_cents']===900 && $q['vat_cents']===171 && $q['total_cents']===1071,'Lamination and area pricing');
$bad=$v;$bad['width_mm']='1400.1';check(rejects(fn()=>print_quote_compute($db,$bad)),'Width above configured maximum');
$bad=$v;$bad['quantity']='1001';check(rejects(fn()=>print_quote_compute($db,$bad)),'Quantity bound');
$bad=$v;$bad['laminate']='fake';check(rejects(fn()=>print_quote_compute($db,$bad)),'Invalid lamination');
$bad=$v;$bad['width_mm']='500.15';check(rejects(fn()=>print_quote_compute($db,$bad)),'Unexpected precision rejected');
$session=['print_request_keys'=>[str_repeat('a',32)=>time()]];
$request=$v+['request_key'=>str_repeat('a',32),'customer_name'=>'Test','email'=>'test@example.com','phone'=>'123','expected_total_cents'=>$q['total_cents'],'expected_revision'=>$q['revision']];
$sent=print_quote_request($db,$request,$session); check($sent['id']===1,'Explicit request should be saved');
$again=print_quote_request($db,$request,$session); check($again['duplicate']===true && (int)$db->query('SELECT COUNT(*) FROM website_inbox')->fetchColumn()===1,'Duplicate request is idempotent');
$db->exec('UPDATE quote_print_products SET price_per_m2_cents=2000, revision=3 WHERE id=1');
$session['print_request_keys'][str_repeat('b',32)]=time();$request['request_key']=str_repeat('b',32);
$changed=print_quote_request($db,$request,$session);check(!empty($changed['changed']) && (int)$db->query('SELECT COUNT(*) FROM website_inbox')->fetchColumn()===1,'Price change must require fresh confirmation');
$session['print_request_keys'][str_repeat('c',32)]=time()-86401;$request['request_key']=str_repeat('c',32);
check(rejects(fn()=>print_quote_request($db,$request,$session)),'Expired session request key rejected');
$db->exec('UPDATE quote_print_products SET shop_reviewed=0, revision=4 WHERE id=1');
check(rejects(fn()=>print_quote_compute($db,$v)),'Saving without re-review disables pricing');
echo "Print configurator checks passed.\n";
