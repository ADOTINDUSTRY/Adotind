<?php
/** @var array $siteConfig */
/** @var array $page */
$cssPath = __DIR__ . '/../../public/assets/css/main.css';
$jsPath = __DIR__ . '/../../public/assets/js/main.js';
$cssVersion = is_file($cssPath) ? (string)filemtime($cssPath) : '1';
$jsVersion = is_file($jsPath) ? (string)filemtime($jsPath) : '1';
?>
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><?= e($page['title']) ?></title>
    <meta
      name="description"
      content="<?= e($page['description'] ?? 'Premium signage manufacturing, CNC machining, laser cutting, printing, and industrial fabrication services in Cyprus by A Dot Industry.') ?>"
    />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta name="author" content="<?= e($siteConfig['brand']) ?>" />
    <link rel="canonical" href="<?= e(canonical_url($siteConfig)) ?>" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="<?= e($page['title']) ?>" />
    <meta
      property="og:description"
      content="<?= e($page['description'] ?? 'Industrial manufacturing capabilities for signage and custom fabrication projects.') ?>"
    />
    <meta property="og:url" content="<?= e(canonical_url($siteConfig)) ?>" />
    <meta property="og:site_name" content="<?= e($siteConfig['brand']) ?>" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="<?= e($page['title']) ?>" />
    <meta
      name="twitter:description"
      content="<?= e($page['description'] ?? 'Manufacturing-focused services by A Dot Industry in Cyprus.') ?>"
    />
    <?php if (!empty($siteConfig['logo_url']) && is_string($siteConfig['logo_url'])): ?>
      <link rel="preload" as="image" href="<?= e($siteConfig['logo_url']) ?>" />
    <?php endif; ?>
    <link rel="stylesheet" href="/public/assets/css/main.css?v=<?= e($cssVersion) ?>" />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": "<?= e($siteConfig['legal_name']) ?>",
        "url": "<?= e(rtrim($siteConfig['base_url'], '/')) ?>",
        "telephone": "<?= e($siteConfig['phone']) ?>",
        "email": "<?= e($siteConfig['email']) ?>",
        "areaServed": "<?= e($siteConfig['country']) ?>",
        "description": "Industrial signage, CNC machining, laser cutting, printing and fabrication services."
      }
    </script>
    <?php if (!empty($page['breadcrumbs']) && is_array($page['breadcrumbs'])): ?>
      <?php
      $crumbItems = [];
      foreach ($page['breadcrumbs'] as $i => $crumb) {
          $crumbItems[] = [
              '@type' => 'ListItem',
              'position' => $i + 1,
              'name' => $crumb['label'],
              'item' => rtrim($siteConfig['base_url'], '/') . $crumb['href'],
          ];
      }
      $breadcrumbSchema = ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => $crumbItems];
      ?>
      <script type="application/ld+json"><?= json_encode($breadcrumbSchema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?></script>
    <?php endif; ?>
  </head>
  <body>
    <?php require __DIR__ . '/components/header.php'; ?>
    <?php if (dashboard_is_authenticated() && ($page['view'] ?? '') !== 'dashboard'): ?>
      <?php
      $editable = (is_array($page['editable'] ?? null)) ? $page['editable'] : [];
      $editorMedia = (is_array($page['editor_media'] ?? null)) ? $page['editor_media'] : [];
      ?>
      <section class="page-editor-bar" aria-label="Page editor">
        <div class="container">
          <details>
            <summary>Edit This Page</summary>
            <form class="quote-form page-editor-form" method="post" action="/dashboard/save-page-content">
              <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
              <input type="hidden" name="path" value="<?= e((string)($page['path'] ?? current_path())) ?>" />

              <label>Section Label (eyebrow)
                <input type="text" name="eyebrow" value="<?= e((string)($editable['eyebrow'] ?? '')) ?>" placeholder="Example: About A Dot Industry" />
              </label>
              <label>Main Title
                <input type="text" name="heading" value="<?= e((string)($editable['heading'] ?? '')) ?>" placeholder="Main H1 text for this page" />
              </label>
              <label>Main Description
                <textarea name="lead" rows="3" placeholder="Main intro description for this page"><?= e((string)($editable['lead'] ?? '')) ?></textarea>
              </label>
              <label>Browser/SEO Title
                <input type="text" name="meta_title" value="<?= e((string)($editable['meta_title'] ?? ($page['title'] ?? ''))) ?>" />
              </label>
              <label>SEO Description
                <textarea name="meta_description" rows="3"><?= e((string)($editable['meta_description'] ?? ($page['description'] ?? ''))) ?></textarea>
              </label>
              <label>Featured Image
                <select name="hero_image_url">
                  <option value="">No override</option>
                  <?php foreach ($editorMedia as $item): ?>
                    <?php $url = (string)($item['url'] ?? ''); ?>
                    <?php if ($url === '') continue; ?>
                    <?php $selected = (($editable['hero_image_url'] ?? '') === $url) ? 'selected' : ''; ?>
                    <option value="<?= e($url) ?>" <?= $selected ?>>
                      <?= e((string)($item['title'] ?? 'Uploaded image')) ?>
                    </option>
                  <?php endforeach; ?>
                </select>
              </label>

              <div class="page-editor-actions">
                <button type="submit" class="btn btn-small">Save Page Changes</button>
                <a class="btn btn-outline btn-small" href="/dashboard">Open Dashboard Media</a>
              </div>
            </form>
          </details>
        </div>
      </section>
    <?php endif; ?>
    <?php require __DIR__ . '/components/breadcrumbs.php'; ?>
    <main>
      <?php require $viewFile; ?>
    </main>
    <?php require __DIR__ . '/components/footer.php'; ?>
    <script src="/public/assets/js/main.js?v=<?= e($jsVersion) ?>" defer></script>
  </body>
</html>
