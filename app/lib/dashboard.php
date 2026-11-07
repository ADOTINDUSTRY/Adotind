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

function dashboard_settings_load(array $siteConfig): array
{
    $file = $siteConfig['media_settings_file'] ?? '';
    if (!is_string($file) || $file === '' || !is_file($file)) {
        return [];
    }
    $raw = file_get_contents($file);
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function dashboard_settings_save(array $siteConfig, array $settings): void
{
    $file = $siteConfig['media_settings_file'] ?? '';
    if (!is_string($file) || $file === '') {
        return;
    }
    $dir = dirname($file);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    file_put_contents($file, json_encode($settings, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
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
    $settings = dashboard_settings_load($siteConfig);
    $count = count($_FILES['photos']['name']);
    $added = 0;
    $autoLogoUrl = '';

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
        if (@getimagesize($tmp) === false) {
            continue;
        }

        $newName = date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
        $target = $uploadDir . '/' . $newName;
        if (!move_uploaded_file($tmp, $target)) {
            continue;
        }

        $baseName = pathinfo($originalName, PATHINFO_FILENAME);
        $title = ucwords(str_replace(['-', '_'], ' ', $baseName));
        $defaultCategory = stripos($baseName, 'logo') !== false ? 'logo' : 'signage';
        if ($defaultCategory === 'logo') {
            $autoLogoUrl = rtrim($siteConfig['uploads_url_base'], '/') . '/' . $newName;
        }
        $media[] = [
            'id' => bin2hex(random_bytes(6)),
            'filename' => $newName,
            'url' => rtrim($siteConfig['uploads_url_base'], '/') . '/' . $newName,
            'title' => $title,
            'description' => 'Project image uploaded via dashboard.',
            'category' => $defaultCategory,
            'uploaded_at' => date('c'),
        ];
        $added++;
    }

    dashboard_media_save($siteConfig, $media);
    if ($autoLogoUrl !== '') {
        $settings['logo_url'] = $autoLogoUrl;
        dashboard_settings_save($siteConfig, $settings);
    } elseif (empty($settings['logo_url']) && $added > 0 && $media !== []) {
        // If no explicit logo is set yet, use latest upload as temporary brand logo.
        $last = $media[array_key_last($media)];
        if (!empty($last['url'])) {
            $settings['logo_url'] = (string)$last['url'];
            dashboard_settings_save($siteConfig, $settings);
        }
    }
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
    $validCategories = ['signage', 'illuminated-signs', 'cnc', 'laser-cutting', 'printing', 'fabrication', 'logo'];
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

function dashboard_handle_set_logo(array $siteConfig): never
{
    dashboard_require_auth();
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !csrf_valid($_POST['csrf_token'] ?? null)) {
        flash_set('dashboard_error', 'Invalid logo request.');
        redirect('/dashboard', 303);
    }
    $id = (string)($_POST['id'] ?? '');
    $media = dashboard_media_load($siteConfig);
    $logoUrl = null;
    foreach ($media as &$item) {
        if (($item['id'] ?? '') === $id) {
            $logoUrl = (string)($item['url'] ?? '');
            $item['category'] = 'logo';
            break;
        }
    }
    unset($item);
    if ($logoUrl === null || $logoUrl === '') {
        flash_set('dashboard_error', 'Selected image not found.');
        redirect('/dashboard', 303);
    }
    dashboard_media_save($siteConfig, $media);
    $settings = dashboard_settings_load($siteConfig);
    $settings['logo_url'] = $logoUrl;
    dashboard_settings_save($siteConfig, $settings);
    flash_set('dashboard_success', 'Logo updated successfully.');
    redirect('/dashboard', 303);
}

function dashboard_handle_delete_media(array $siteConfig): never
{
    dashboard_require_auth();
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !csrf_valid($_POST['csrf_token'] ?? null)) {
        flash_set('dashboard_error', 'Invalid delete request.');
        redirect('/dashboard', 303);
    }

    $id = (string)($_POST['id'] ?? '');
    if ($id === '') {
        flash_set('dashboard_error', 'Image not found.');
        redirect('/dashboard', 303);
    }

    $media = dashboard_media_load($siteConfig);
    $deletedItem = null;
    foreach ($media as $index => $item) {
        if (($item['id'] ?? '') === $id) {
            $deletedItem = $item;
            unset($media[$index]);
            break;
        }
    }

    if ($deletedItem === null) {
        flash_set('dashboard_error', 'Image not found.');
        redirect('/dashboard', 303);
    }

    $filename = basename((string)($deletedItem['filename'] ?? ''));
    if ($filename !== '') {
        $uploadDir = rtrim((string)$siteConfig['uploads_dir'], '/');
        $filePath = $uploadDir . '/' . $filename;
        if (is_file($filePath)) {
            unlink($filePath);
        }
    }

    dashboard_media_save($siteConfig, array_values($media));

    $settings = dashboard_settings_load($siteConfig);
    $deletedUrl = (string)($deletedItem['url'] ?? '');
    if ($deletedUrl !== '' && (($settings['logo_url'] ?? '') === $deletedUrl)) {
        unset($settings['logo_url']);
        dashboard_settings_save($siteConfig, $settings);
    }

    flash_set('dashboard_success', 'Image deleted successfully.');
    redirect('/dashboard', 303);
}
