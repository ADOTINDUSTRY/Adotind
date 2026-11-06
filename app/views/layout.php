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
      content="Premium signage manufacturing, CNC machining, laser cutting, printing, and industrial fabrication services in Cyprus by A Dot Industry."
    />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta name="author" content="<?= e($siteConfig['brand']) ?>" />
    <link rel="canonical" href="<?= e(canonical_url($siteConfig)) ?>" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="<?= e($page['title']) ?>" />
    <meta
      property="og:description"
      content="Industrial manufacturing capabilities for signage and custom fabrication projects."
    />
    <meta property="og:url" content="<?= e(canonical_url($siteConfig)) ?>" />
    <meta property="og:site_name" content="<?= e($siteConfig['brand']) ?>" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="<?= e($page['title']) ?>" />
    <meta
      name="twitter:description"
      content="Manufacturing-focused services by A Dot Industry in Cyprus."
    />
    <link rel="stylesheet" href="/public/assets/css/main.css" />
  </head>
  <body>
    <?php require __DIR__ . '/components/header.php'; ?>
    <main>
      <?php require $viewFile; ?>
    </main>
    <?php require __DIR__ . '/components/footer.php'; ?>
    <script src="/public/assets/js/main.js" defer></script>
  </body>
</html>
