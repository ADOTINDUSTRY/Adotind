<?php
declare(strict_types=1);
require __DIR__ . '/../app/lib/quote_system.php';
function site_daily_count(string $metric): void {}
function online_quote_unlocked(): bool { return true; }
function csrf_valid($token): bool { return true; }
function flash_set(string $key, $value): void { $GLOBALS['testFlash'][$key] = $value; }
function redirect(string $url, int $status): never { throw new RuntimeException('test redirect'); }
function checkSubmission(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
$root = tempnam(sys_get_temp_dir(), 'dxf-submit'); unlink($root); mkdir($root);
$file = $root . '/drawing.dxf';
$header = "0\nSECTION\n2\nHEADER\n9\n\$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n";
$body = "0\nLINE\n10\n0\n20\n0\n11\n100\n21\n50\n0\nENDSEC\n0\nEOF\n";
file_put_contents($file, $header . $body);
$_SERVER['REQUEST_METHOD'] = 'POST';
$_POST = ['csrf_token'=>'test', 'drawing_contents'=>'single', 'machine_id'=>1, 'material_id'=>1, 'part_width_mm'=>10, 'part_height_mm'=>5, 'quantity'=>1];
$_FILES = ['vector_file'=>['error'=>UPLOAD_ERR_OK, 'name'=>'drawing.dxf', 'size'=>filesize($file), 'tmp_name'=>$file]];
$GLOBALS['testFlash'] = [];
try { handle_online_quote_calculate(['quote_db_file'=>$root . '/quote.sqlite']); }
catch (RuntimeException $e) { checkSubmission($e->getMessage() === 'test redirect', 'Request should reject by redirecting.'); }
checkSubmission(str_contains($GLOBALS['testFlash']['online_quote_error'] ?? '', 'does not match'), 'Server must reject a customer size smaller than the DXF.');
unlink($file); rmdir($root . '/quote-drafts'); rmdir($root);
echo "DXF submission checks passed.\n";
