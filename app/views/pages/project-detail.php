<?php
$project = $page['project'];
?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow"><?= e(editable_text($page, 'eyebrow', 'Project Detail')) ?></p>
    <h1><?= e(editable_text($page, 'heading', (string)$project['title'])) ?></h1>
    <p class="lead"><?= e(editable_text($page, 'lead', (string)$project['description'])) ?></p>
    <?php if (editable_text($page, 'hero_image_url', '') !== ''): ?>
      <div class="hero-media-card page-hero-media">
        <img src="<?= e(editable_text($page, 'hero_image_url', '')) ?>" alt="<?= e(editable_text($page, 'heading', 'Project page image')) ?>" loading="lazy" />
      </div>
    <?php endif; ?>
  </div>
</section>

<section class="section">
  <div class="container two-col">
    <div>
      <h2>Materials Used</h2>
      <ul class="feature-list">
        <?php foreach ($project['materials'] as $material): ?>
          <li><?= e($material) ?></li>
        <?php endforeach; ?>
      </ul>
    </div>
    <div>
      <h2>Manufacturing Techniques</h2>
      <ul class="feature-list">
        <?php foreach ($project['techniques'] as $technique): ?>
          <li><?= e($technique) ?></li>
        <?php endforeach; ?>
      </ul>
    </div>
  </div>
</section>

<section class="section section-dark">
  <div class="container">
    <h2>Project Assets Status</h2>
    <p class="lead">
      This entry is a structured placeholder. Confirmed photography, technical
      process notes and final project documentation will be published once
      approved.
    </p>
    <a href="/portfolio" class="btn btn-outline">Back to Portfolio</a>
  </div>
</section>
