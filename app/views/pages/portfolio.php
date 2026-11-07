<?php
$projects = $page['projects'];
$media = $page['media'] ?? [];
$categories = ['all', 'signage', 'illuminated-signs', 'cnc', 'laser-cutting', 'printing', 'fabrication'];
?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow">Portfolio</p>
    <h1>Projects and Production Categories</h1>
    <p class="lead">
      Project photos and details will be shown here using your provided assets.
    </p>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="filter-row" role="group" aria-label="Portfolio category filters">
      <?php foreach ($categories as $category): ?>
        <button type="button" class="filter-btn<?= $category === 'all' ? ' is-active' : '' ?>" data-filter="<?= e($category) ?>">
          <?= e(ucwords(str_replace('-', ' ', $category))) ?>
        </button>
      <?php endforeach; ?>
    </div>

    <div class="gallery-grid portfolio-grid">
      <?php if ($media !== []): ?>
        <?php foreach ($media as $item): ?>
          <article class="gallery-item portfolio-item" data-category="<?= e((string)($item['category'] ?? 'signage')) ?>">
            <img class="gallery-photo" src="<?= e((string)$item['url']) ?>" alt="<?= e((string)($item['title'] ?? 'Project image')) ?>" loading="lazy" />
            <h3><?= e((string)($item['title'] ?? 'Project image')) ?></h3>
            <p class="muted"><?= e((string)($item['description'] ?? 'Project image from dashboard upload.')) ?></p>
          </article>
        <?php endforeach; ?>
      <?php else: ?>
        <?php foreach ($projects as $project): ?>
          <article class="gallery-item portfolio-item" data-category="<?= e($project['category']) ?>">
            <div class="photo-placeholder" role="img" aria-label="<?= e($project['title']) ?> image placeholder">
              <p>Project Placeholder</p>
              <small>Upload images from dashboard</small>
            </div>
            <h3><?= e($project['title']) ?></h3>
            <p class="muted"><?= e($project['description']) ?></p>
            <a href="/portfolio/<?= e($project['slug']) ?>" class="text-link">View details</a>
          </article>
        <?php endforeach; ?>
      <?php endif; ?>
    </div>
  </div>
</section>
