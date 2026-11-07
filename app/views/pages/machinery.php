<?php $items = $page['machinery']; ?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow"><?= e(editable_text($page, 'eyebrow', 'Machinery & Technology')) ?></p>
    <h1><?= e(editable_text($page, 'heading', 'Manufacturing Equipment Overview')) ?></h1>
    <p class="lead"><?= e(editable_text($page, 'lead', 'The following equipment list reflects currently reported capabilities. Detailed technical specifications are intentionally withheld until confirmed.')) ?></p>
    <?php if (editable_text($page, 'hero_image_url', '') !== ''): ?>
      <div class="hero-media-card page-hero-media">
        <img src="<?= e(editable_text($page, 'hero_image_url', '')) ?>" alt="<?= e(editable_text($page, 'heading', 'Machinery page image')) ?>" loading="lazy" />
      </div>
    <?php endif; ?>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="service-grid">
      <?php foreach ($items as $item): ?>
        <article class="service-card">
          <h2><?= e($item['name']) ?></h2>
          <p><strong>Status:</strong> <?= e($item['status']) ?></p>
          <p><?= e($item['notes']) ?></p>
        </article>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section class="section section-dark">
  <div class="container">
    <h2>Specifications Pending Confirmation</h2>
    <ul class="feature-list">
      <li>Machine brands and model numbers</li>
      <li>Laser power levels and confirmed thickness ranges</li>
      <li>CNC tolerances and repeatability benchmarks</li>
      <li>Working envelopes and supported file formats by machine</li>
    </ul>
  </div>
</section>
