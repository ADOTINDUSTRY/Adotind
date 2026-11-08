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

function dashboard_location_options(): array
{
    return [
        'portfolio-gallery' => 'Portfolio Gallery',
        'home-hero' => 'Homepage Hero Image',
        'home-featured' => 'Homepage Featured Projects',
        'about-hero' => 'About Page Header',
        'services-hero' => 'Services Page Header',
        'contact-hero' => 'Contact Page Header',
    ];
}

function dashboard_normalize_location(string $location): string
{
    $allowed = array_keys(dashboard_location_options());
    return in_array($location, $allowed, true) ? $location : 'portfolio-gallery';
}

function dashboard_bootstrap_storage(array $siteConfig): void
{
    $root = dirname(__DIR__, 2);
    $uploadsDir = rtrim((string)($siteConfig['uploads_dir'] ?? ''), '/');
    $mediaFile = (string)($siteConfig['media_index_file'] ?? '');
    $settingsFile = (string)($siteConfig['media_settings_file'] ?? '');
    if ($uploadsDir === '' || $mediaFile === '') {
        return;
    }

    foreach (array_unique([$uploadsDir, dirname($mediaFile), dirname($settingsFile)]) as $dir) {
        if ($dir !== '' && !is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
    }

    // The media root sits inside public_html: block direct web access to it.
    // Images reach visitors only through the /media/ endpoint, and JSON data
    // (library, settings, customer inquiries) is never served by Apache.
    $mediaRoot = dirname($uploadsDir);
    $denyFile = $mediaRoot . '/.htaccess';
    if ($mediaRoot !== '' && is_dir($mediaRoot) && !is_file($denyFile)) {
        file_put_contents(
            $denyFile,
            "Require all denied\n<IfModule !mod_authz_core.c>\n    Deny from all\n</IfModule>\n"
        );
    }

    // One-time migration of dashboard data that used to live inside Adotind/storage.
    $internalMediaFile = $root . '/storage/media/library.json';
    $internalSettingsFile = $root . '/storage/media/settings.json';
    if (!is_file($mediaFile) && is_file($internalMediaFile)) {
        copy($internalMediaFile, $mediaFile);
    }
    if ($settingsFile !== '' && !is_file($settingsFile) && is_file($internalSettingsFile)) {
        copy($internalSettingsFile, $settingsFile);
    }

    // Migrate referenced image files into the external uploads folder and rewrite URLs.
    $media = dashboard_media_load($siteConfig);
    $urlBase = rtrim((string)($siteConfig['uploads_url_base'] ?? '/media'), '/');
    $changed = false;
    foreach ($media as &$item) {
        $url = (string)($item['url'] ?? '');
        if ($url === '' || starts_with($url, '/media/')) {
            continue;
        }
        $local = dashboard_resolve_local_media_path($siteConfig, $url);
        if ($local === '') {
            continue;
        }
        $name = basename($local);
        $target = $uploadsDir . '/' . $name;
        if (!is_file($target)) {
            copy($local, $target);
        }
        if (is_file($target)) {
            $item['url'] = $urlBase . '/' . $name;
            $item['filename'] = $name;
            $changed = true;
        }
    }
    unset($item);
    if ($changed) {
        dashboard_media_save($siteConfig, $media);
    }

    // Mirror the optimized logo to a repo-local static file so Apache serves it
    // directly (no PHP) and it stays fast after every deployment.
    $brandingDir = $root . '/public/assets/branding';
    foreach (['webp', 'png'] as $ext) {
        $src = $uploadsDir . '/brand-logo.' . $ext;
        if (!is_file($src)) {
            continue;
        }
        if (!is_dir($brandingDir)) {
            mkdir($brandingDir, 0755, true);
        }
        $dst = $brandingDir . '/brand-logo.' . $ext;
        if (!is_file($dst) || filemtime($dst) < filemtime($src)) {
            copy($src, $dst);
        }
    }

    if ($settingsFile !== '') {
        $settings = dashboard_settings_load($siteConfig);
        $logo = (string)($settings['logo_url'] ?? '');
        if ($logo !== '' && !starts_with($logo, '/media/')) {
            $local = dashboard_resolve_local_media_path($siteConfig, $logo);
            if ($local !== '') {
                $name = basename($local);
                $target = $uploadsDir . '/' . $name;
                if (!is_file($target)) {
                    copy($local, $target);
                }
                if (is_file($target)) {
                    $settings['logo_url'] = $urlBase . '/' . $name;
                    dashboard_settings_save($siteConfig, $settings);
                }
            }
        }
    }
}

function dashboard_serve_media(array $siteConfig, string $filename): never
{
    if ($filename === '' || preg_match('/^[A-Za-z0-9._-]+$/', $filename) !== 1) {
        http_response_code(404);
        exit;
    }
    $uploadsDir = rtrim((string)($siteConfig['uploads_dir'] ?? ''), '/');
    $path = $uploadsDir . '/' . $filename;
    if ($uploadsDir === '' || !is_file($path) || filesize($path) <= 0) {
        http_response_code(404);
        exit;
    }
    $info = @getimagesize($path);
    if ($info === false) {
        http_response_code(404);
        exit;
    }
    header('Content-Type: ' . ($info['mime'] ?? 'application/octet-stream'));
    header('Content-Length: ' . (string)filesize($path));
    header('Cache-Control: public, max-age=31536000, immutable');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
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

function dashboard_resolve_local_media_path(array $siteConfig, string $url): string
{
    if ($url === '') {
        return '';
    }

    $path = $url;
    if (preg_match('#^https?://#i', $url) === 1) {
        $parts = parse_url($url);
        $siteParts = parse_url((string)($siteConfig['base_url'] ?? ''));
        $urlHost = strtolower((string)($parts['host'] ?? ''));
        $siteHost = strtolower((string)($siteParts['host'] ?? ''));
        if ($urlHost === '' || $siteHost === '' || $urlHost !== $siteHost) {
            return '';
        }
        $path = (string)($parts['path'] ?? '');
    }

    // External media folder (survives deployments): /media/<filename>.
    if (starts_with($path, '/media/')) {
        $uploadsDir = rtrim((string)($siteConfig['uploads_dir'] ?? ''), '/');
        $name = basename($path);
        if ($uploadsDir !== '' && $name !== '') {
            $localPath = $uploadsDir . '/' . $name;
            if (is_file($localPath) && filesize($localPath) > 0) {
                return $localPath;
            }
        }
        return '';
    }

    $candidatePaths = [$path];
    if (starts_with($path, '/uploads/')) {
        $candidatePaths[] = '/public' . $path;
    }
    if (starts_with($path, '/assets/')) {
        $candidatePaths[] = '/public' . $path;
    }

    $projectRoot = dirname(__DIR__, 2);
    foreach ($candidatePaths as $candidatePath) {
        if (!starts_with($candidatePath, '/public/uploads/') && !starts_with($candidatePath, '/public/assets/')) {
            continue;
        }
        $localPath = $projectRoot . rawurldecode($candidatePath);
        if (is_file($localPath) && filesize($localPath) > 0) {
            return $localPath;
        }
    }

    return '';
}

function dashboard_optimize_logo(array $siteConfig, string $sourceImagePath): string
{
    if (!is_file($sourceImagePath) || filesize($sourceImagePath) <= 0) {
        return '';
    }
    $imageInfo = @getimagesize($sourceImagePath);
    if ($imageInfo === false) {
        return '';
    }

    $uploadsDir = rtrim((string)($siteConfig['uploads_dir'] ?? ''), '/');
    if ($uploadsDir === '') {
        return '';
    }
    if (!is_dir($uploadsDir)) {
        mkdir($uploadsDir, 0755, true);
    }

    $targetWebpPath = $uploadsDir . '/brand-logo.webp';
    $targetPngPath = $uploadsDir . '/brand-logo.png';
    $uploadsUrlBase = rtrim((string)($siteConfig['uploads_url_base'] ?? '/public/uploads/projects'), '/');

    $sourceType = (int)($imageInfo[2] ?? 0);
    $createFn = match ($sourceType) {
        IMAGETYPE_JPEG => 'imagecreatefromjpeg',
        IMAGETYPE_PNG => 'imagecreatefrompng',
        IMAGETYPE_WEBP => 'imagecreatefromwebp',
        default => null,
    };

    if ($createFn === null || !function_exists($createFn) || !function_exists('imagecreatetruecolor')) {
        $copyTarget = $targetPngPath;
        if (@copy($sourceImagePath, $copyTarget)) {
            return $uploadsUrlBase . '/' . basename($copyTarget);
        }
        return '';
    }

    $sourceImg = @$createFn($sourceImagePath);
    if ($sourceImg === false) {
        return '';
    }

    $srcWidth = (int)imagesx($sourceImg);
    $srcHeight = (int)imagesy($sourceImg);
    if ($srcWidth <= 0 || $srcHeight <= 0) {
        imagedestroy($sourceImg);
        return '';
    }

    $maxDimension = 320;
    $scale = min(1, $maxDimension / max($srcWidth, $srcHeight));
    $dstWidth = max(1, (int)round($srcWidth * $scale));
    $dstHeight = max(1, (int)round($srcHeight * $scale));

    $dstImg = imagecreatetruecolor($dstWidth, $dstHeight);
    imagealphablending($dstImg, false);
    imagesavealpha($dstImg, true);
    $transparent = imagecolorallocatealpha($dstImg, 0, 0, 0, 127);
    imagefilledrectangle($dstImg, 0, 0, $dstWidth, $dstHeight, $transparent);
    imagecopyresampled($dstImg, $sourceImg, 0, 0, 0, 0, $dstWidth, $dstHeight, $srcWidth, $srcHeight);

    $optimizedUrl = '';
    if (function_exists('imagewebp') && @imagewebp($dstImg, $targetWebpPath, 82)) {
        $optimizedUrl = $uploadsUrlBase . '/' . basename($targetWebpPath);
    } elseif (@imagepng($dstImg, $targetPngPath, 7)) {
        $optimizedUrl = $uploadsUrlBase . '/' . basename($targetPngPath);
    }

    imagedestroy($dstImg);
    imagedestroy($sourceImg);
    return $optimizedUrl;
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
        session_regenerate_id(true);
        $_SESSION['dashboard_auth'] = true;
        flash_set('dashboard_success', 'Welcome to dashboard.');
        redirect('/dashboard', 303);
    }

    // Slow down brute-force attempts.
    usleep(800000);
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
    $uploadLocation = dashboard_normalize_location((string)($_POST['location'] ?? 'portfolio-gallery'));
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
            'location' => $uploadLocation,
            'uploaded_at' => date('c'),
        ];
        $added++;
    }

    dashboard_media_save($siteConfig, $media);
    if ($autoLogoUrl !== '') {
        $sourcePath = dashboard_resolve_local_media_path($siteConfig, $autoLogoUrl);
        $optimizedLogoUrl = $sourcePath !== '' ? dashboard_optimize_logo($siteConfig, $sourcePath) : '';
        $settings['logo_url'] = $optimizedLogoUrl !== '' ? $optimizedLogoUrl : $autoLogoUrl;
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
    $location = dashboard_normalize_location((string)($_POST['location'] ?? 'portfolio-gallery'));
    $validCategories = ['signage', 'illuminated-signs', 'cnc', 'laser-cutting', 'printing', 'fabrication', 'logo'];
    if (!in_array($category, $validCategories, true)) {
        $category = 'signage';
    }

    foreach ($media as &$item) {
        if (($item['id'] ?? '') === $id) {
            $item['title'] = $title !== '' ? $title : $item['title'];
            $item['description'] = $description;
            $item['category'] = $category;
            $item['location'] = $location;
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
    $sourcePath = dashboard_resolve_local_media_path($siteConfig, $logoUrl);
    $optimizedLogoUrl = $sourcePath !== '' ? dashboard_optimize_logo($siteConfig, $sourcePath) : '';
    $settings['logo_url'] = $optimizedLogoUrl !== '' ? $optimizedLogoUrl : $logoUrl;
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
