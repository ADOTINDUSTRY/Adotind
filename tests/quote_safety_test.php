<?php
declare(strict_types=1);
require __DIR__ . '/../app/lib/quote_system.php';
function checkQuoteSafety(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
function expectQuoteReview(callable $fn, string $expected): void {
    try { $fn(); throw new RuntimeException('Expected the quotation to require review.'); }
    catch (DomainException $e) { checkQuoteSafety(str_contains($e->getMessage(), $expected), 'Incorrect review reason: ' . $e->getMessage()); }
}

// Migration remains compatible whether the ERP or public site adds columns first.
$old = new PDO('sqlite::memory:'); $old->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $old->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
quote_install_schema($old); quote_seed_defaults($old);
$oldRate = (float)$old->query('SELECT cut_speed_mm_min FROM quote_machine_materials WHERE id=1')->fetchColumn();
quote_migrate_safety_columns($old);
checkQuoteSafety((int)$old->query('SELECT COUNT(*) FROM quote_machine_materials WHERE shop_reviewed=1')->fetchColumn() === 0, 'Seeded rates must not be treated as reviewed.');
checkQuoteSafety((float)$old->query('SELECT cut_speed_mm_min FROM quote_machine_materials WHERE id=1')->fetchColumn() === $oldRate, 'Migration must preserve existing speeds.');
$old->exec('UPDATE quote_machine_materials SET shop_reviewed=1 WHERE id=1');
$old->exec('UPDATE quote_machines SET bed_width_mm=1400,bed_height_mm=1000 WHERE id=1');
quote_migrate_safety_columns($old);
checkQuoteSafety((int)$old->query('SELECT shop_reviewed FROM quote_machine_materials WHERE id=1')->fetchColumn() === 1, 'Repeat migrations must preserve shop review.');
checkQuoteSafety((float)$old->query('SELECT bed_width_mm FROM quote_machines WHERE id=1')->fetchColumn() === 1400.0, 'Repeat migrations must preserve configured bed dimensions.');

$path = tempnam(sys_get_temp_dir(), 'quote-safety');
$config = ['quote_db_file'=>$path];
$db = quote_db($config);
checkQuoteSafety((int)$db->query('PRAGMA user_version')->fetchColumn() === 4, 'New databases must have the safety schema.');
$input = ['machine_id'=>1,'material_id'=>1,'part_width_mm'=>500,'part_height_mm'=>250,'vector_length_mm'=>1200,'quantity'=>1,'ext'=>'dxf', 'verified_dxf_bounds'=>['width_mm'=>500,'height_mm'=>250]];
$unverified = $input; unset($unverified['verified_dxf_bounds']);
expectQuoteReview(fn()=>quote_current_pricing($config,$unverified), 'upload the DXF');
$notDxf = $input; $notDxf['ext'] = 'svg';
expectQuoteReview(fn()=>quote_current_pricing($config,$notDxf), 'upload the DXF');
expectQuoteReview(fn()=>quote_current_pricing($config,$input), 'needs shop review');
$db->exec('UPDATE quote_machine_materials SET shop_reviewed=1 WHERE machine_id=1 AND material_id=1');
expectQuoteReview(fn()=>quote_current_pricing($config,$input), 'working area has not been verified');
$db->exec('UPDATE quote_machines SET bed_width_mm=1400,bed_height_mm=1000 WHERE id=1');
expectQuoteReview(fn()=>quote_current_pricing($config,$input), 'material sheet does not fit');
$db->exec('UPDATE quote_materials SET sheet_width_mm=1000,sheet_height_mm=600 WHERE id=1');
$result = quote_current_pricing($config,$input);
checkQuoteSafety(isset($result['estimate']['total_cost']), 'Reviewed pair with a suitable bed and sheet should be quotable.');
$rotated = $input; $rotated['part_width_mm']=900; $rotated['part_height_mm']=1200;
$rotated['verified_dxf_bounds']=['width_mm'=>1200,'height_mm'=>900];
$db->exec('UPDATE quote_materials SET sheet_width_mm=1400,sheet_height_mm=1000 WHERE id=1');
checkQuoteSafety(isset(quote_current_pricing($config,$rotated)['estimate']['total_cost']), 'A part fitting after rotation should be accepted.');
$large = $input; $large['part_width_mm']=1401; $large['part_height_mm']=999;
$large['verified_dxf_bounds']=['width_mm'=>1401,'height_mm'=>999];
expectQuoteReview(fn()=>quote_current_pricing($config,$large), 'part size does not fit');
$db->exec('UPDATE quote_materials SET sheet_width_mm=1000,sheet_height_mm=600 WHERE id=6');
$db->exec('UPDATE quote_machine_materials SET shop_reviewed=1 WHERE machine_id=1 AND material_id=6');
$pvc = $input; $pvc['material_id']=6;
expectQuoteReview(fn()=>quote_current_pricing($config,$pvc), 'cannot be quoted for CO2');
$db->exec("UPDATE quote_materials SET name='Expanded polyvinyl chloride' WHERE id=6");
expectQuoteReview(fn()=>quote_current_pricing($config,$pvc), 'cannot be quoted for CO2');
$db->exec('UPDATE quote_machine_materials SET shop_reviewed=0 WHERE machine_id=1 AND material_id=1');
$stale = ['input'=>$input,'estimate'=>$result['estimate'],'token'=>'old'];
expectQuoteReview(fn()=>quote_refresh_preview($config,$stale), 'needs shop review');
$db = null; quote_db(['quote_db_file'=>':memory:']);
@unlink($path); @unlink($path . '-wal'); @unlink($path . '-shm');
echo "Quote safety checks passed.\n";
