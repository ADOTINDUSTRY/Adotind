<?php
$navItems = [
    ['label' => 'Home', 'href' => '/'],
    ['label' => 'About', 'href' => '/about'],
    ['label' => 'Services', 'href' => '/services'],
    ['label' => 'Portfolio', 'href' => '/portfolio'],
    ['label' => 'Machinery', 'href' => '/machinery'],
    ['label' => 'Materials', 'href' => '/materials'],
    ['label' => 'Industries', 'href' => '/industries'],
    ['label' => 'Contact', 'href' => '/contact'],
];
$currentPath = current_path();
?>
<header class="site-header">
  <div class="container nav-shell">
    <a href="/" class="brand">
      <span class="brand-mark">A·D</span>
      <span class="brand-text"><?= e($siteConfig['brand']) ?></span>
    </a>
    <button class="nav-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <nav class="main-nav" aria-label="Primary">
      <?php foreach ($navItems as $item): ?>
        <?php
        $active = rtrim($currentPath, '/') === rtrim($item['href'], '/')
          || ($item['href'] !== '/' && starts_with($currentPath, $item['href'] . '/'));
        ?>
        <a class="<?= $active ? 'is-active' : '' ?>" href="<?= e($item['href']) ?>"><?= e($item['label']) ?></a>
      <?php endforeach; ?>
    </nav>
    <a href="/contact" class="btn btn-quote">Request a Quote</a>
  </div>
</header>
