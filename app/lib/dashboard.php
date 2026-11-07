<?php
declare(strict_types=1);

function dashboard_is_authenticated(): bool
{
    return !empty($_SESSION['dashboard_auth']) && $_SESSION['dashboard_auth'] === true;
}

function dashboard_require_auth(): void
{
    if (!dashboard_is_authenticated()) {
        redirect('/dashboard', 303);
    }
}

function dashboard_media_load(array $siteConfig): array
{
    $file = $siteConfig['media_index_file'];
    if (!is_file($file)) {
        return [];
    }
    $raw = file_get_contents($file);
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return [];
    }
    return $data;
}

function dashboard_media_save(array $siteConfig, array $media): void
{
    $file = $siteConfig['media_index_file'];
    $dir = dirname($file);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    file_put_contents($file, json_encode($media, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}

function dashboard_handle_login(array $siteConfig): never
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !csrf_valid($_POST['csrf_token'] ?? null)) {
        flash_set('dashboard_error', 'Invalid request.');
        redirect('/dashboard', 303);
    }
    $username = trim((string)($_POST['username'] ?? ''));
    $password = (string)($_POST['password'] ?? '');

    if ($username === $siteConfig['dashboard_user'] && password_verify($password, $siteConfig['dashboard_password_hash'])) {
        $_SESSION['dashboard_auth'] = true;
        flash_set('dashboard_success', 'Welcome to dashboard.');
        redirect('/dashboard', 303);
    }

    flash_set('dashboard_error', 'Invalid username or password.');
    redirect('/dashboard', 303);
}

function dashboard_handle_logout(): never
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !csrf_valid($_POST['csrf_token'] ?? null)) {
        redirect('/dashboard', 303);
    }
    unset($_SESSION['dashboard_auth']);
    flash_set('dashboard_success', 'You have been logged out.');
    redirect('/dashboard', 303);
}

function dashboard_handle_upload(array $siteConfig): never
{
    dashboard_require_auth();
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !csrf_valid($_POST['csrf_token'] ?? null)) {
        flash_set('dashboard_error', 'Invalid upload request.');
        redirect('/dashboard', 303);
    }

    if (!isset($_FILES['photos']) || !is_array($_FILES['photos']['name'])) {
        flash_set('dashboard_error', 'No files selected.');
        redirect('/dashboard', 303);
    }

    $allowedExt = ['jpg', 'jpeg', 'png', 'webp'];
    $uploadDir = $siteConfig['uploads_dir'];
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $media = dashboard_media_load($siteConfig);
    $count = count($_FILES['photos']['name']);
    $added = 0;

    for ($i = 0; $i < $count; $i++) {
        $error = (int)$_FILES['photos']['error'][$i];
        if ($error === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        if ($error !== UPLOAD_ERR_OK) {
            continue;
        }

        $tmp = (string)$_FILES['photos']['tmp_name'][$i];
        $originalName = (string)$_FILES['photos']['name'][$i];
        $size = (int)$_FILES['photos']['size'][$i];
        if ($size <= 0 || $size > 20 * 1024 * 1024) {
            continue;
        }

        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if (!in_array($ext, $allowedExt, true)) {
            continue;
        }

        $newName = date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
        $target = $uploadDir . '/' . $newName;
        if (!move_uploaded_file($tmp, $target)) {
            continue;
        }

        $title = ucwords(str_replace(['-', '_'], ' ', pathinfo($originalName, PATHINFO_FILENAME)));
        $media[] = [
            'id' => bin2hex(random_bytes(6)),
            'filename' => $newName,
            'url' => rtrim($siteConfig['uploads_url_base'], '/') . '/' . $newName,
            'title' => $title,
            'description' => 'Project image uploaded via dashboard.',
            'category' => 'signage',
            'uploaded_at' => date('c'),
        ];
        $added++;
    }

    dashboard_media_save($siteConfig, $media);
    flash_set('dashboard_success', $added > 0 ? "Uploaded {$added} image(s)." : 'No files were uploaded.');
    redirect('/dashboard', 303);
}

function dashboard_handle_update_meta(array $siteConfig): never
{
    dashboard_require_auth();
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !csrf_valid($_POST['csrf_token'] ?? null)) {
        flash_set('dashboard_error', 'Invalid metadata request.');
        redirect('/dashboard', 303);
    }
    $media = dashboard_media_load($siteConfig);
    $id = (string)($_POST['id'] ?? '');
    $title = trim((string)($_POST['title'] ?? ''));
    $description = trim((string)($_POST['description'] ?? ''));
    $category = trim((string)($_POST['category'] ?? ''));
    $validCategories = ['signage', 'illuminated-signs', 'cnc', 'laser-cutting', 'printing', 'fabrication'];
    if (!in_array($category, $validCategories, true)) {
        $category = 'signage';
    }

    foreach ($media as &$item) {
        if (($item['id'] ?? '') === $id) {
            $item['title'] = $title !== '' ? $title : $item['title'];
            $item['description'] = $description;
            $item['category'] = $category;
            break;
        }
    }
    unset($item);
    dashboard_media_save($siteConfig, $media);
    flash_set('dashboard_success', 'Image details updated.');
    redirect('/dashboard', 303);
}
