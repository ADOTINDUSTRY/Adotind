<?php
declare(strict_types=1);

require __DIR__ . '/../../app/lib/quote_system.php';

function online_quote_unlocked(): bool { return true; }
function csrf_valid($token): bool { return true; }
function flash_set(string $key, $value): void { $GLOBALS['flash'] = [$key, $value]; }
function redirect(string $url, int $status): never { throw new RuntimeException('redirect'); }

function assert_quote(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function expect_rejection(array $post, array $files, string $message): void
{
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_POST = $post;
    $_FILES = $files;
    $GLOBALS['flash'] = null;
    try {
        handle_online_quote_calculate([]);
    } catch (RuntimeException $e) {
        assert_quote($e->getMessage() === 'redirect', $e->getMessage());
    }
    assert_quote(str_contains($GLOBALS['flash'][1] ?? '', $message), "Expected rejection: $message");
}

expect_rejection(['drawing_contents' => 'multiple'], [], 'multiple parts');
expect_rejection(['drawing_contents' => 'unsure'], [], 'multiple parts');
expect_rejection([], [], 'multiple parts');
expect_rejection(
    ['drawing_contents' => 'single', 'part_width_mm' => '10', 'part_height_mm' => '10'],
    ['vector_file' => ['error' => UPLOAD_ERR_OK, 'name' => 'drawing.svg', 'size' => 100]],
    'DXF drawing'
);

$machine = ['setup_minutes' => 0, 'setup_cost' => 0, 'hourly_rate' => 60, 'min_charge' => 0];
$material = ['sheet_width_mm' => 100, 'sheet_height_mm' => 50, 'sheet_price' => 10, 'waste_percent' => 0];
$rate = ['cut_speed_mm_min' => 100, 'pierce_time_sec' => 0];
$input = ['vector_length_mm' => 200, 'part_width_mm' => 20, 'part_height_mm' => 10, 'quantity' => 3];
$estimate = quote_build_estimate($machine, $material, $rate, [], $input);
assert_quote($estimate['cut_minutes'] === 6.0, 'Cut time must account for each copy');
$input['part_width_mm'] = 101;
try {
    quote_build_estimate($machine, $material, $rate, [], $input);
    throw new RuntimeException('Oversized part was accepted');
} catch (RuntimeException $e) {
    assert_quote(str_contains($e->getMessage(), 'does not fit'), 'Oversized part must be referred for review');
}
$drawing = tempnam(sys_get_temp_dir(), 'quote-dxf-');
assert_quote($drawing !== false, 'Could not create DXF fixture');
try {
    $dxf = implode("\n", [
        '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '14', '0', 'ENDSEC',
        '0', 'SECTION', '2', 'ENTITIES',
        '0', 'LINE', '10', '0', '20', '0', '11', '3', '21', '4',
        '0', 'LWPOLYLINE', '70', '1',
        '10', '0', '20', '0', '10', '2', '20', '0', '42', '1', '10', '4', '20', '0',
        '0', 'ENDSEC', '0', 'EOF', '',
    ]);
    file_put_contents($drawing, $dxf);
    $expected = (5 + 2 + M_PI + 4) * 100;
    assert_quote(abs(quote_extract_dxf_length_mm($drawing) - $expected) < 0.00001, 'DXF units or polyline bulges were measured incorrectly');
    file_put_contents($drawing, "0\nLINE\n10\n");
    try {
        quote_extract_dxf_length_mm($drawing);
        throw new RuntimeException('Incomplete DXF was accepted');
    } catch (RuntimeException $e) {
        assert_quote(str_contains($e->getMessage(), 'incomplete'), 'Incomplete DXF must be rejected');
    }

    $handle = fopen($drawing, 'wb');
    fwrite($handle, "0\nSECTION\n2\nENTITIES\n");
    for ($i = 0; $i < 150000; $i++) {
        fwrite($handle, "0\nLINE\n10\n0\n20\n0\n11\n10\n21\n10\n");
    }
    fwrite($handle, "0\nENDSEC\n0\nEOF\n");
    fclose($handle);
    ini_set('memory_limit', '32M');
    assert_quote(abs(quote_extract_dxf_length_mm($drawing) - 150000 * hypot(10, 10)) < 0.01, 'Large DXF must be measured without exhausting memory');

    $handle = fopen($drawing, 'wb');
    fwrite($handle, "0\nLWPOLYLINE\n70\n0\n");
    for ($i = 0; $i < 150000; $i++) {
        fwrite($handle, "10\n$i\n20\n0\n");
    }
    fwrite($handle, "0\nEOF\n");
    fclose($handle);
    assert_quote(quote_extract_dxf_length_mm($drawing) === 149999.0, 'Large polyline must be measured without exhausting memory');
} finally {
    unlink($drawing);
}
echo "Quote flow checks passed\n";
