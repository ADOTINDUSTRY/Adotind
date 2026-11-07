<?php
$projects = $page['projects'];
$media = $page['media'] ?? [];
$categories = ['all', 'signage', 'illuminated-signs', 'cnc', 'laser-cutting', 'printing', 'fabrication'];
?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow"><?= e(editable_text($page, 'eyebrow', 'Portfolio')) ?></p>
    <h1><?= e(editable_text($page, 'heading', 'Projects and Production Categories')) ?></h1>
    <p class="lead"><?= e(editable_text($page, 'lead', 'Project photos and details will be shown here using your provided assets.')) ?></p>
    <?php if (editable_text($page, 'hero_image_url', '') !== ''): ?>
      <div class="hero-media-card page-hero-media">
        <img src="<?= e(editable_text($page, 'hero_image_url', '')) ?>" alt="<?= e(editable_text($page, 'heading', 'Portfolio page image')) ?>" loading="lazy" />
      </div>
    <?php endif; ?>
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
