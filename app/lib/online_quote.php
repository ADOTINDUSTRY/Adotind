<?php
declare(strict_types=1);

function online_quote_unlocked(): bool
{
    return !empty($_SESSION['online_quote_unlocked']);
}

function handle_online_quote_pin_submit(): never
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        redirect('/online-quote', 303);
    }
    if (!csrf_valid($_POST['csrf_token'] ?? null)) {
        flash_set('online_quote_pin_error', 'Security validation failed. Please try again.');
        redirect('/online-quote', 303);
    }

    $pin = trim((string)($_POST['pin'] ?? ''));
    if (!hash_equals('2468', $pin)) {
        flash_set('online_quote_pin_error', 'Incorrect PIN. Please try again.');
        redirect('/online-quote', 303);
    }

    $_SESSION['online_quote_unlocked'] = true;
    flash_set('online_quote_pin_success', 'PIN accepted. Testing mode unlocked.');
    redirect('/online-quote', 303);
}

function handle_online_quote_updates_submit(array $siteConfig): never
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        redirect('/online-quote', 303);
    }
    if (!csrf_valid($_POST['csrf_token'] ?? null)) {
        flash_set('online_quote_updates_error', 'Security validation failed. Please try again.');
        redirect('/online-quote', 303);
    }

    $email = trim((string)($_POST['email'] ?? ''));
    if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        flash_set('online_quote_updates_error', 'Please enter a valid email address.');
        redirect('/online-quote', 303);
    }

    $dir = (string)($siteConfig['inquiries_dir'] ?? (__DIR__ . '/../../storage/inquiries'));
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $entry = json_encode([
        'type' => 'online_quote_update_request',
        'email' => $email,
        'submitted_at' => date('c'),
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
    ], JSON_UNESCAPED_SLASHES);
    file_put_contents($dir . '/quote-updates.log', $entry . PHP_EOL, FILE_APPEND);

    $subject = 'Online Quote updates signup';
    $body = "New updates signup for Online Quote page:\n\nEmail: {$email}\nSubmitted at: " . date('c')
        . "\nIP: " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . "\n";
    $headers = [
        'From: noreply@adotind.com',
        'Reply-To: ' . $email,
        'Content-Type: text/plain; charset=UTF-8',
    ];
    @mail((string)$siteConfig['email'], $subject, $body, implode("\r\n", $headers));

    flash_set('online_quote_updates_success', 'Thank you. We will notify you when online quotation is ready.');
    redirect('/online-quote', 303);
}
