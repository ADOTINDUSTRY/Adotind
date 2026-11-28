<?php
declare(strict_types=1);
require __DIR__ . '/../app/lib/quote_system.php';
function checkDxf(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
function dxfText(?int $units, string $entities): string {
    $header = $units === null ? '' : "9\n\$INSUNITS\n70\n$units\n";
    return "0\nSECTION\n2\nHEADER\n" . $header . "0\nENDSEC\n0\nSECTION\n2\nENTITIES\n" . $entities . "0\nENDSEC\n0\nEOF\n";
}
function measureTestDxf(string $text): array {
    $path = tempnam(sys_get_temp_dir(), 'dxf-bounds');
    file_put_contents($path, $text);
    try { return quote_dxf_bounds_mm($path); } finally { unlink($path); }
}
function measureTestDxfLength(string $text): float {
    $path = tempnam(sys_get_temp_dir(), 'dxf-length');
    file_put_contents($path, $text);
    try { return quote_extract_dxf_length_mm($path); } finally { unlink($path); }
}
function expectDxfReview(string $text): void {
    try { measureTestDxf($text); throw new LogicException('Expected a shop review for unsupported drawing.'); }
    catch (RuntimeException $e) { /* Expected. */ }
}
function nearBounds(float $actual, float $minimum): bool { return $actual >= $minimum && $actual-$minimum < 0.0001; }
$rect = "0\nLWPOLYLINE\n90\n4\n70\n1\n10\n0\n20\n0\n10\n100\n20\n0\n10\n100\n20\n50\n10\n0\n20\n50\n";
$bounds = measureTestDxf(dxfText(4,$rect));
checkDxf(nearBounds($bounds['width_mm'],100) && nearBounds($bounds['height_mm'],50), 'Rectangle bounds should include all vertices.');
$inch = measureTestDxf(dxfText(1,"0\nLINE\n10\n0\n20\n0\n11\n1\n21\n2\n"));
checkDxf(nearBounds($inch['width_mm'],25.4) && nearBounds($inch['height_mm'],50.8), 'Explicit inches must convert to millimetres.');
checkDxf(abs(measureTestDxfLength(dxfText(1,"0\nLINE\n10\n0\n20\n0\n11\n1\n21\n2\n")) - hypot(25.4,50.8)) < 0.000001, 'Length and bounds must use the same inch scale.');
$circle = measureTestDxf(dxfText(4,"0\nCIRCLE\n10\n100\n20\n200\n40\n10\n"));
checkDxf(nearBounds($circle['width_mm'],20) && nearBounds($circle['height_mm'],20), 'Circle bounds should include cardinal extrema.');
$arc = measureTestDxf(dxfText(4,"0\nARC\n10\n0\n20\n0\n40\n10\n50\n350\n51\n10\n"));
checkDxf(nearBounds($arc['width_mm'],10-10*cos(deg2rad(10))) && nearBounds($arc['height_mm'],20*sin(deg2rad(10))), 'A wrapped arc must include the zero-degree extremum.');
$bulge = measureTestDxf(dxfText(4,"0\nLWPOLYLINE\n90\n3\n70\n0\n10\n0\n20\n0\n42\n1\n10\n10\n20\n0\n10\n10\n20\n5\n"));
checkDxf(nearBounds($bulge['width_mm'],10) && nearBounds($bulge['height_mm'],10), 'Polyline bulges must include circular extrema.');
$reverse = measureTestDxf(dxfText(4,"0\nLWPOLYLINE\n90\n3\n70\n0\n10\n0\n20\n0\n42\n-1\n10\n10\n20\n0\n10\n10\n20\n-5\n"));
checkDxf(nearBounds($reverse['width_mm'],10) && nearBounds($reverse['height_mm'],10), 'Clockwise bulges must include circular extrema.');
$closed = measureTestDxf(dxfText(4,"0\nLWPOLYLINE\n90\n3\n70\n1\n10\n0\n20\n0\n10\n10\n20\n0\n10\n10\n20\n10\n42\n1\n"));
checkDxf($closed['width_mm'] >= 12.071 && $closed['height_mm'] >= 12.071, 'The last vertex bulge must be applied to the closing segment.');
expectDxfReview(dxfText(null,$rect));
expectDxfReview(dxfText(0,$rect));
expectDxfReview(dxfText(4,"0\nSPLINE\n10\n0\n20\n0\n"));
expectDxfReview(dxfText(4,"0\nLINE\n10\n0\n20\n0\n11\n10\n"));
expectDxfReview(dxfText(4,"0\nLINE\n10\n0\n20\n0\n11\n10\n21\n10\n30\n1\n"));
expectDxfReview(dxfText(4,"0\nLINE\n10\n0\n20\n0\n11\n10\n21\n10\n210\n1\n"));
expectDxfReview(dxfText(4,"0\nLINE\n10\n0\n20\n0\n11\n10\n21\n10\n410\nLayout1\n"));
expectDxfReview(dxfText(4,"0\nLINE\n10\n10000000000000000\n20\n0\n11\n10000000000001001\n21\n100\n"));
expectDxfReview(dxfText(4,"0\nLWPOLYLINE\n90\n2\n10\n0\n20\n0\n42\n0.000000001\n10\n10\n20\n10\n"));
expectDxfReview(str_replace("9\n\$INSUNITS\n70\n", "9\n\$INSUNITS\n070\n", dxfText(1,$rect)));
expectDxfReview(str_replace("10\n0\n", "010\n0\n", dxfText(4,$rect)));
expectDxfReview(str_replace("9\n\$INSUNITS\n70\n", "9\n\$INSUNITS\n999\ncomment\n70\n", dxfText(1,$rect)));
expectDxfReview("0\nLINE\n10\n0\n20\n0\n11\n5\n21\n5\n" . dxfText(4,$rect));
expectDxfReview(dxfText(4,$rect) . "0\nLINE\n");
try { quote_verified_dxf_size(['width_mm'=>100.00001,'height_mm'=>50.00001], 20, 10); throw new LogicException('Underreported sizes must be rejected.'); } catch (DomainException $e) {}
$rotated = quote_verified_dxf_size(['width_mm'=>100.00001,'height_mm'=>50.00001], 50, 100);
checkDxf($rotated[0] >= 50.00001 && $rotated[1] >= 100.00001, 'Rotated dimensions must preserve conservative drawing bounds.');
$path = tempnam(sys_get_temp_dir(), 'large-dxf-bounds');
$file = fopen($path, 'wb');
fwrite($file, "0\nSECTION\n2\nHEADER\n9\n\$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n");
for ($i=0; $i<150000; $i++) fwrite($file, "0\nLINE\n10\n0\n20\n0\n11\n10\n21\n10\n");
fwrite($file, "0\nENDSEC\n0\nEOF\n"); fclose($file);
ini_set('memory_limit', '32M');
try {
    $large = quote_dxf_bounds_mm($path);
    checkDxf(nearBounds($large['width_mm'],10) && nearBounds($large['height_mm'],10), 'Large DXFs must be streamed within limited memory.');
} finally { unlink($path); }
echo "DXF dimension checks passed.\n";
