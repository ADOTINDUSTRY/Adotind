<?php
/** @var array $siteConfig */
/** @var array $page */
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
    <link rel="stylesheet" href="/public/assets/css/main.css" />
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
    <?php require __DIR__ . '/components/breadcrumbs.php'; ?>
    <main>
      <?php require $viewFile; ?>
    </main>
    <?php require __DIR__ . '/components/footer.php'; ?>
    <script src="/public/assets/js/main.js" defer></script>
  </body>
</html>
