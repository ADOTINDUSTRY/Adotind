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

<section class="section" data-tracking-section="specific-services">
  <div class="container">
    <h2>Explore services by project</h2>
    <p>Find guidance for a particular material or type of work.</p>
    <div class="service-grid">
      <?php foreach (($page['service_landings'] ?? []) as $slug => $landing): ?>
      <article class="service-card">
        <h3><?= e($landing['name']) ?></h3>
        <p><?= e($landing['summary']) ?></p>
        <a href="/services/<?= e($slug) ?>" class="text-link">Explore <?= e($landing['name']) ?></a>
      </article>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section class="section" data-tracking-section="service-list">
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
