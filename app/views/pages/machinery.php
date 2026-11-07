<?php $items = $page['machinery']; ?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow">Machinery & Technology</p>
    <h1>Manufacturing Equipment Overview</h1>
    <p class="lead">
      The following equipment list reflects currently reported capabilities.
      Detailed technical specifications are intentionally withheld until
      confirmed.
    </p>
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
