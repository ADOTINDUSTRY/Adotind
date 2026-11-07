<?php /** @var array $page */ ?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow">Services</p>
    <h1>Industrial Services for Signage and Manufacturing</h1>
    <p class="lead">
      Explore our full capability set, from visual branding systems to precision
      machining and fabrication workflows.
    </p>
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
