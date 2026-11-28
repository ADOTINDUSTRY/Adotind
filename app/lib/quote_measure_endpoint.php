<?php
declare(strict_types=1);
require_once __DIR__ . '/quote_dxf_bounds.php';

/** Measure a temporary upload without storing it, creating a quote, or sending it elsewhere. */
function quote_measure_upload(): never
{
    $reply = static function (int $status, array $payload): never {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    };
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') $reply(405, ['error'=>'Please upload a DXF drawing.']);
    if (!online_quote_unlocked()) $reply(403, ['error'=>'The quote tester is locked.']);
    if (!is_string($_POST['csrf_token'] ?? null) || !csrf_valid($_POST['csrf_token'])) $reply(403, ['error'=>'Please refresh the page and try again.']);
    $file = $_FILES['vector_file'] ?? null;
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK
        || !is_string($file['name'] ?? null) || strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) !== 'dxf'
        || !is_string($file['tmp_name'] ?? null) || !is_uploaded_file($file['tmp_name'])
        || !is_numeric($file['size'] ?? null) || (int)$file['size'] < 1 || (int)$file['size'] > 50 * 1024 * 1024) {
        $reply(400, ['error'=>'Choose a DXF drawing up to 50 MB.']);
    }
    // Keep this expensive parser bounded per session as well as by file size.
    $recent = array_values(array_filter($_SESSION['quote_measure_calls'] ?? [], static fn($t) => is_int($t) && $t > time() - 60));
    if (count($recent) >= 20) $reply(429, ['error'=>'Please wait a moment before measuring another drawing.']);
    $recent[] = time(); $_SESSION['quote_measure_calls'] = $recent;
    session_write_close();
    try {
        $bounds = quote_dxf_bounds_mm($file['tmp_name']);
        $reply(200, ['width_mm'=>round((float)$bounds['width_mm'], 1), 'height_mm'=>round((float)$bounds['height_mm'], 1)]);
    } catch (Throwable $e) {
        $reply(422, ['error'=>'We could not measure this drawing automatically. Check its units and geometry or contact us for review.']);
    }
}
