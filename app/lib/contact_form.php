<?php
declare(strict_types=1);

function sanitize_text(string $value): string
{
    return trim(preg_replace('/\s+/', ' ', $value) ?? '');
}

function handle_contact_submit(array $siteConfig): never
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        redirect('/contact', 303);
    }

    if (!csrf_valid($_POST['csrf_token'] ?? null)) {
        flash_set('form_error', 'Security validation failed. Please try again.');
        redirect('/contact', 303);
    }

    $fields = [
        'customer_name' => sanitize_text((string)($_POST['customer_name'] ?? '')),
        'company_name' => sanitize_text((string)($_POST['company_name'] ?? '')),
        'email' => sanitize_text((string)($_POST['email'] ?? '')),
        'phone' => sanitize_text((string)($_POST['phone'] ?? '')),
        'service_required' => sanitize_text((string)($_POST['service_required'] ?? '')),
        'project_description' => trim((string)($_POST['project_description'] ?? '')),
        'dimensions' => sanitize_text((string)($_POST['dimensions'] ?? '')),
        'material' => sanitize_text((string)($_POST['material'] ?? '')),
        'quantity' => sanitize_text((string)($_POST['quantity'] ?? '')),
    ];

    $errors = [];
    $required = ['customer_name', 'email', 'phone', 'service_required', 'project_description'];
    foreach ($required as $name) {
        if ($fields[$name] === '') {
            $errors[$name] = 'This field is required.';
        }
    }
    if ($fields['email'] !== '' && filter_var($fields['email'], FILTER_VALIDATE_EMAIL) === false) {
        $errors['email'] = 'Please enter a valid email address.';
    }

    $uploadPath = null;
    $uploadError = '';
    if (isset($_FILES['project_file']) && is_array($_FILES['project_file']) && (int)$_FILES['project_file']['error'] !== UPLOAD_ERR_NO_FILE) {
        $file = $_FILES['project_file'];
        if ((int)$file['error'] !== UPLOAD_ERR_OK) {
            $uploadError = 'File upload failed. Please try again.';
        } else {
            $maxBytes = 10 * 1024 * 1024;
            if ((int)$file['size'] > $maxBytes) {
                $uploadError = 'File is too large. Max size is 10MB.';
            } else {
                $ext = strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION));
                $allowed = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'svg', 'dxf', 'dwg', 'zip'];
                if (!in_array($ext, $allowed, true)) {
                    $uploadError = 'Unsupported file type.';
                } else {
                    $safeName = date('Ymd-His') . '-' . bin2hex(random_bytes(6)) . '.' . $ext;
                    $targetDir = __DIR__ . '/../../storage/inquiries';
                    if (!is_dir($targetDir)) {
                        mkdir($targetDir, 0755, true);
                    }
                    $target = $targetDir . '/' . $safeName;
                    if (!move_uploaded_file((string)$file['tmp_name'], $target)) {
                        $uploadError = 'Could not save uploaded file.';
                    } else {
                        $uploadPath = $target;
                    }
                }
            }
        }
    }

    if ($uploadError !== '') {
        $errors['project_file'] = $uploadError;
    }

    if ($errors !== []) {
        flash_set('form_error', 'Please correct the highlighted fields.');
        flash_set('form_errors', $errors);
        flash_set('form_old', $fields);
        redirect('/contact', 303);
    }

    $subject = 'New Quote Request - A Dot Industry';
    $body = "New inquiry received:\n\n";
    foreach ($fields as $key => $value) {
        $label = ucwords(str_replace('_', ' ', $key));
        $body .= $label . ': ' . ($value === '' ? 'N/A' : $value) . "\n";
    }
    $body .= "Uploaded file: " . ($uploadPath ? basename($uploadPath) : 'None') . "\n";
    $body .= 'Submitted at: ' . date('c') . "\n";
    $body .= 'IP: ' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . "\n";

    $headers = [
        'From: noreply@adotind.com',
        'Reply-To: ' . $fields['email'],
        'Content-Type: text/plain; charset=UTF-8',
    ];

    $mailSent = mail($siteConfig['email'], $subject, $body, implode("\r\n", $headers));

    $logLine = json_encode([
        'submitted_at' => date('c'),
        'fields' => $fields,
        'uploaded_file' => $uploadPath ? basename($uploadPath) : null,
        'mail_sent' => $mailSent,
    ], JSON_UNESCAPED_SLASHES);
    file_put_contents(__DIR__ . '/../../storage/inquiries/inquiries.log', $logLine . PHP_EOL, FILE_APPEND);

    if ($mailSent) {
        flash_set('form_success', 'Thank you. Your inquiry was sent successfully.');
    } else {
        flash_set('form_error', 'Your inquiry was saved, but email delivery could not be confirmed. Please contact us directly by phone.');
    }

    redirect('/contact', 303);
}
