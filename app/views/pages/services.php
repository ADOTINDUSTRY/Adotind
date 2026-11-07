<?php /** @var array $page */ ?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow"><?= e(editable_text($page, 'eyebrow', 'Services')) ?></p>
    <h1><?= e(editable_text($page, 'heading', 'Industrial Services for Signage and Manufacturing')) ?></h1>
    <p class="lead"><?= e(editable_text($page, 'lead', 'Explore our full capability set, from visual branding systems to precision machining and fabrication workflows.')) ?></p>
    <?php if (editable_text($page, 'hero_image_url', '') !== ''): ?>
      <div class="hero-media-card page-hero-media">
        <img src="<?= e(editable_text($page, 'hero_image_url', '')) ?>" alt="<?= e(editable_text($page, 'heading', 'Services page image')) ?>" loading="lazy" />
      </div>
    <?php endif; ?>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="service-grid">
      <?php foreach ($page['services'] as $service): ?>
        <article class="service-card">
          <h2><?= e($service['name']) ?></h2>
          <p><?= e($service['summary']) ?></p>
          <a href="/services/<?= e($service['slug']) ?>" class="text-link">View service details</a>
        </article>
      <?php endforeach; ?>
    </div>
  </div>
</section>
