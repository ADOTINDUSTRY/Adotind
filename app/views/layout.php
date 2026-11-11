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
    <?php if (($page['view'] ?? '') === 'dashboard'): ?>
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <?php else: ?>
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <?php endif; ?>
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
    <script>
      /* Loader only on the first page of a visit; later pages must not flash it. */
      try { if (sessionStorage.getItem('adot_seen') === '1') document.documentElement.classList.add('no-preloader'); } catch (e) {}
    </script>
    <style>
      .no-preloader #preloader{display:none!important}
      /* Critical preloader styles so it appears immediately, before main CSS loads. */
      #preloader{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#070c1c;transition:opacity .45s ease,visibility .45s ease}
      #preloader.is-done{opacity:0;visibility:hidden;pointer-events:none}
      #preloader .preloader-inner{display:grid;justify-items:center;gap:1rem}
      #preloader .preloader-logo{width:72px;height:72px;object-fit:contain}
      #preloader .preloader-spinner{width:44px;height:44px;border-radius:50%;border:3px solid rgba(255,255,255,.14);border-top-color:#fde613;border-right-color:#e5162c;animation:preloader-spin .9s linear infinite}
      #preloader .preloader-text{color:#93a1bd;font-size:.78rem;font-weight:800;letter-spacing:.24em;text-transform:uppercase}
      @keyframes preloader-spin{to{transform:rotate(360deg)}}
    </style>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Orbitron:wght@700;800&display=swap" onload="this.onload=null;this.rel='stylesheet'" />
    <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Orbitron:wght@700;800&display=swap" /></noscript>
    <?php if (!empty($siteConfig['logo_url']) && is_string($siteConfig['logo_url'])): ?>
      <link rel="preload" as="image" href="<?= e($siteConfig['logo_url']) ?>" />
    <?php endif; ?>
    <link rel="preload" as="style" href="/public/assets/css/main.css?v=<?= e($cssVersion) ?>" fetchpriority="high" />
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
    <div id="preloader" class="preloader" role="status" aria-label="Loading">
      <div class="preloader-inner">
        <?php if (!empty($siteConfig['logo_url']) && is_string($siteConfig['logo_url'])): ?>
          <img class="preloader-logo" src="<?= e($siteConfig['logo_url']) ?>" alt="" width="72" height="72" />
        <?php endif; ?>
        <div class="preloader-spinner" aria-hidden="true"></div>
        <span class="preloader-text"><?= e($siteConfig['brand']) ?></span>
      </div>
    </div>
    <?php require __DIR__ . '/components/header.php'; ?>
    <?php require __DIR__ . '/components/breadcrumbs.php'; ?>
    <main>
      <?php require $viewFile; ?>
    </main>
    <?php require __DIR__ . '/components/footer.php'; ?>
    <script src="/public/assets/js/main.js?v=<?= e($jsVersion) ?>" defer></script>
  </body>
</html>
