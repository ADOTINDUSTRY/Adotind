<?php
$projects = $page['projects'];
$categories = ['all', 'signage', 'illuminated-signs', 'cnc', 'laser-cutting', 'printing', 'fabrication'];
?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow">Portfolio</p>
    <h1>Projects and Production Categories</h1>
    <p class="lead">
      Official project media is published via your company Facebook and Google
      Maps profiles, combined with categorized project records below.
    </p>
    <div class="cta-group">
      <a href="<?= e($siteConfig['facebook_photos']) ?>" class="btn btn-outline" target="_blank" rel="noopener noreferrer">Open Facebook Photos</a>
      <a href="<?= e($siteConfig['maps_url']) ?>" class="btn btn-outline" target="_blank" rel="noopener noreferrer">Open Google Maps Photos</a>
    </div>
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
      <?php foreach ($projects as $project): ?>
        <article class="gallery-item portfolio-item" data-category="<?= e($project['category']) ?>">
          <div class="photo-placeholder" role="img" aria-label="<?= e($project['title']) ?> image placeholder">
            <p>Official Photos Available</p>
            <small>View full media in the links above</small>
          </div>
          <h3><?= e($project['title']) ?></h3>
          <p class="muted"><?= e($project['description']) ?></p>
          <a href="/portfolio/<?= e($project['slug']) ?>" class="text-link">View details</a>
        </article>
      <?php endforeach; ?>
    </div>
  </div>
</section>
