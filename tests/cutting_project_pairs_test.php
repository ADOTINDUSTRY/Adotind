<?php
declare(strict_types=1);
require __DIR__ . '/../app/lib/quote_system.php';

function cutting_check(bool $ok, string $why): void { if (!$ok) throw new RuntimeException($why); }
function cutting_denied(callable $fn): void {
    try { $fn(); } catch (DomainException $e) { return; }
    throw new RuntimeException('An invalid project choice must not produce an estimate.');
}
function has_pair(array $pairs, int $machine, int $material): bool {
    return in_array(['machine_id'=>$machine,'material_id'=>$material], $pairs, true);
}
foreach (['cnc', 'cnc-1', 'cnc_router', 'cnc-router-2'] as $code) {
    cutting_check(quote_cutting_project_matches('drawing', ['code'=>$code], ['name'=>'Acrylic']), "CNC code {$code} should match.");
}
foreach (['fiber', 'co2', 'cnc-fiber', 'unknown'] as $code) {
    cutting_check(!quote_cutting_project_matches('drawing', ['code'=>$code], ['name'=>'Acrylic']), "Non-router code {$code} must not match.");
}

$path = tempnam(sys_get_temp_dir(), 'cutting-projects-');
$config = ['quote_db_file'=>$path];
$db = quote_db($config);
$db->exec('UPDATE quote_machines SET bed_width_mm=3000,bed_height_mm=1500');
$db->exec('UPDATE quote_materials SET sheet_width_mm=1000,sheet_height_mm=600');
$db->exec('UPDATE quote_machine_materials SET shop_reviewed=0');
$db->exec('UPDATE quote_machine_materials SET shop_reviewed=1 WHERE (machine_id=1 AND material_id IN (1,6)) OR (machine_id=2 AND material_id=3) OR (machine_id=3 AND material_id=1)');
$options = quote_active_options($config);
$pairs = $options['project_pairs'];
cutting_check(has_pair($pairs['co2'], 1, 1), 'Reviewed CO2 acrylic should appear.');
cutting_check(!has_pair($pairs['co2'], 1, 6), 'CO2 PVC must never be offered, even when reviewed.');
cutting_check(has_pair($pairs['fiber'], 2, 3) && !has_pair($pairs['co2'], 2, 3), 'Machine project filters must differ.');
cutting_check(has_pair($pairs['metal'], 2, 3) && !has_pair($pairs['acrylic'], 2, 3), 'Material family filters must differ.');
cutting_check(has_pair($pairs['acrylic'], 1, 1) && has_pair($pairs['acrylic'], 3, 1), 'Reviewed acrylic should support more than one machine.');
cutting_check(!has_pair($pairs['wood'], 1, 2), 'Unreviewed rates must not be offered.');
cutting_check(has_pair($pairs['drawing'], 3, 1) && !has_pair($pairs['drawing'], 1, 1) && !has_pair($pairs['drawing'], 2, 3), 'Custom CNC cutting must not choose a laser.');
cutting_check(!has_pair($pairs['drawing'], 1, 6), 'Custom CNC cutting must not offer CO2 PVC.');
$db->exec('UPDATE quote_machines SET bed_width_mm=NULL,bed_height_mm=NULL WHERE id=2');
cutting_check(!has_pair(quote_active_options($config)['project_pairs']['fiber'], 2, 3), 'An unknown bed must not be offered.');
$db->exec('UPDATE quote_machines SET bed_width_mm=3000,bed_height_mm=1500 WHERE id=2');
$input = ['machine_id'=>1,'material_id'=>1,'cutting_project'=>'co2','part_width_mm'=>100,'part_height_mm'=>50,
    'vector_length_mm'=>300,'quantity'=>1,'ext'=>'dxf','verified_dxf_bounds'=>['width_mm'=>100,'height_mm'=>50]];
cutting_check(isset(quote_current_pricing($config,$input)['estimate']['total_cost']), 'An eligible pair should be priced by the server.');
$bad = $input; $bad['cutting_project']='fiber';
cutting_denied(fn()=>quote_current_pricing($config,$bad));
$bad['cutting_project']='metal';
cutting_denied(fn()=>quote_current_pricing($config,$bad));
$bad['cutting_project']='unknown';
cutting_denied(fn()=>quote_current_pricing($config,$bad));
$legacy = $input; unset($legacy['cutting_project']);
cutting_denied(fn()=>quote_current_pricing($config,$legacy));
$oldDraft = ['input'=>$legacy,'estimate'=>['total_cost'=>1,'currency'=>'€'],'token'=>'old'];
cutting_denied(fn()=>quote_refresh_preview($config,$oldDraft));
$db->exec('UPDATE quote_machine_materials SET shop_reviewed=0 WHERE machine_id=1 AND material_id=1');
cutting_denied(fn()=>quote_current_pricing($config,$input));
$db = null; quote_db(['quote_db_file'=>':memory:']);
@unlink($path); @unlink($path . '-wal'); @unlink($path . '-shm');
echo "Cutting project pair checks passed.\n";
