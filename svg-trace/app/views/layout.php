<?php
/** @var array $page @var array|null $user @var StConfig $config */
$base = '/svg-trace';
$cssPath = __DIR__ . '/../../public/assets/app.css';
$cssVersion = is_file($cssPath) ? (string)filemtime($cssPath) : '1';
?>
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title><?= StSecurity::e($page['title']) ?></title>
<meta name="description" content="Convert raster images into scalable SVG vectors. Built for sign makers, laser operators, CNC professionals and designers." />
<meta name="robots" content="<?= ($page['view'] ?? '') === 'landing' || in_array($page['view'] ?? '', ['privacy','terms','login','404'], true) ? 'index, follow' : 'noindex, nofollow' ?>" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
<link rel="stylesheet" href="<?= $base ?>/assets/app.css?v=<?= $cssVersion ?>" />
<?php if ($user !== null): ?>
<meta name="csrf-token" content="<?= StSecurity::e(StSecurity::csrfToken()) ?>" />
<?php endif; ?>
</head>
<body>
<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="<?= $base ?>/">
      <span class="brand-dot"></span> A Dot <strong>SVG Trace</strong>
    </a>
    <nav class="top-nav">
      <?php if ($user !== null): ?>
        <a href="<?= $base ?>/trace">Workspace</a>
        <a href="<?= $base ?>/account">My files</a>
        <?php if ((int)($user['is_admin'] ?? 0) === 1): ?>
          <a href="<?= $base ?>/admin">Admin</a>
        <?php endif; ?>
        <?php if (StAuth::isGuest($user)): ?>
          <a class="btn btn-primary" href="<?= $base ?>/login" title="You are a guest. Sign in to keep your files.">Save my files</a>
        <?php else: ?>
        <form method="post" action="<?= $base ?>/logout" class="inline">
          <?= StSecurity::csrfField() ?>
          <button class="btn btn-ghost" type="submit">Sign out</button>
        </form>
        <?php endif; ?>
      <?php else: ?>
        <a href="<?= $base ?>/privacy">Privacy</a>
        <a class="btn btn-primary" href="<?= $base ?>/login">Sign in</a>
      <?php endif; ?>
    </nav>
  </div>
</header>
<main>
<?php require __DIR__ . '/pages/' . basename((string)$page['view']) . '.php'; ?>
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <div>
      <strong>A Dot SVG Trace</strong> by A Dot Industry Enterprises Ltd, Cyprus.<br />
      <a href="https://adotind.com">adotind.com</a> · <a href="mailto:info@adotind.com">info@adotind.com</a> · +357 97840173
    </div>
    <div class="foot-links">
      <a href="<?= $base ?>/privacy">Privacy policy</a>
      <a href="<?= $base ?>/terms">Terms of service</a>
    </div>
  </div>
</footer>
<?php foreach ((array)($page['scripts'] ?? []) as $script):
    $jsPath = __DIR__ . '/../../public/assets/' . basename((string)$script); ?>
<script src="<?= $base ?>/assets/<?= StSecurity::e(basename((string)$script)) ?>?v=<?= is_file($jsPath) ? filemtime($jsPath) : '1' ?>" defer></script>
<?php endforeach; ?>
</body>
</html>
