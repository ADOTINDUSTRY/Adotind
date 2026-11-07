<?php /** @var array $page */ ?>
<?php $heroMedia = $page['hero_media'] ?? []; ?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow">Services</p>
    <h1>Industrial Services for Signage and Manufacturing</h1>
    <p class="lead">
      Explore our full capability set, from visual branding systems to precision
      machining and fabrication workflows.
    </p>
    <?php if (!empty($heroMedia[0]['url'])): ?>
      <div class="hero-media-card page-hero-media">
        <img src="<?= e((string)$heroMedia[0]['url']) ?>" alt="<?= e((string)($heroMedia[0]['title'] ?? 'Services image')) ?>" loading="lazy" />
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
