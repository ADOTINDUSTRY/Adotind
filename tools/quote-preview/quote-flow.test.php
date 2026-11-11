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
echo "Quote flow checks passed\n";
