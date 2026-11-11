<?php
$navItems = [
    ['label' => 'Home', 'href' => '/'],
    ['label' => 'About', 'href' => '/about'],
    ['label' => 'Services', 'href' => '/services'],
    ['label' => 'Portfolio', 'href' => '/portfolio'],
    ['label' => 'Machinery', 'href' => '/machinery'],
    ['label' => 'Materials', 'href' => '/materials'],
    ['label' => 'Industries', 'href' => '/industries'],
    ['label' => 'Online Quote', 'href' => '/online-quote'],
    ['label' => 'Contact', 'href' => '/contact'],
];
$currentPath = current_path();
?>
<header class="site-header">
  <div class="container nav-shell">
    <a href="/" class="brand">
      <?php if (!empty($siteConfig['logo_url'])): ?>
        <img
          class="brand-logo"
          src="<?= e($siteConfig['logo_url']) ?>"
          alt="<?= e($siteConfig['brand']) ?> logo"
          width="52"
          height="52"
          fetchpriority="high"
          decoding="async"
        />
      <?php endif; ?>
      <span class="brand-text"><?= e($siteConfig['brand']) ?></span>
    </a>
    <button class="nav-toggle" type="button" aria-label="Menu" aria-expanded="false">Menu</button>
    <nav class="main-nav" aria-label="Primary">
      <?php foreach ($navItems as $item): ?>
        <?php
        $active = rtrim($currentPath, '/') === rtrim($item['href'], '/')
          || ($item['href'] !== '/' && starts_with($currentPath, $item['href'] . '/'));
        ?>
        <a class="<?= $active ? 'is-active' : '' ?>" href="<?= e($item['href']) ?>"><?= e($item['label']) ?></a>
      <?php endforeach; ?>
    </nav>
    <a href="/online-quote" class="btn btn-quote">Request a Quote</a>
  </div>
</header>
