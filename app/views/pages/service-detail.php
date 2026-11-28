<?php
$service = $page['service'];
$detail = (require __DIR__ . '/../../data/service_details.php')[$service['slug']] ?? null;
?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow">Service Detail</p>
    <h1><?= e($service['name']) ?></h1>
    <p class="lead"><?= e($service['summary']) ?></p>
  </div>
</section>

<?php if ($detail !== null): ?>
<section class="section" data-tracking-section="service-overview">
  <div class="container two-col">
    <div>
      <h2>How We Can Help</h2>
      <?php foreach ($detail['intro'] as $paragraph): ?><p class="lead"><?= e($paragraph) ?></p><?php endforeach; ?>
    </div>
    <div>
      <h2>What to Share With Us</h2>
      <p>These details help us understand your project and prepare an accurate quotation:</p>
      <ul class="feature-list">
        <?php foreach ($detail['considerations'] as $item): ?><li><?= e($item) ?></li><?php endforeach; ?>
      </ul>
    </div>
  </div>
</section>
<?php endif; ?>

<?php $relatedLandings = array_filter($page['service_landings'] ?? [], static fn($landing) => $landing['parent'] === $service['slug']); ?>
<?php if ($relatedLandings !== []): ?>
<section class="section" data-tracking-section="specific-services">
  <div class="container"><h2>Explore this service</h2><div class="service-grid">
    <?php foreach ($relatedLandings as $slug => $landing): ?>
    <article class="service-card"><h3><?= e($landing['name']) ?></h3><p><?= e($landing['summary']) ?></p>
      <a class="text-link" href="/services/<?= e($slug) ?>">Explore <?= e($landing['name']) ?></a>
    </article>
    <?php endforeach; ?>
  </div></div>
</section>
<?php endif; ?>

<section class="section">
  <div class="container two-col">
    <div data-tracking-section="applications">
      <h2>Applications</h2>
      <ul class="feature-list">
        <?php foreach ($service['applications'] as $application): ?>
          <li><?= e($application) ?></li>
        <?php endforeach; ?>
      </ul>
    </div>
    <div data-tracking-section="materials">
      <h2>Common Materials</h2>
      <ul class="feature-list">
        <?php foreach ($service['materials'] as $material): ?>
          <li><?= e($material) ?></li>
        <?php endforeach; ?>
      </ul>
    </div>
  </div>
</section>

<section class="section section-dark">
  <div class="container two-col">
    <div data-tracking-section="process">
      <h2>Manufacturing Process</h2>
      <ol class="process-list">
        <?php if ($detail !== null): ?>
        <?php foreach ($detail['process'] as $step): ?><li><?= e($step) ?></li><?php endforeach; ?>
        <?php else: ?>
        <li>Requirement review and technical scope confirmation</li>
        <li>Design and production planning</li>
        <li>Material preparation and manufacturing execution</li>
        <li>Quality checks and finishing</li>
        <li>Delivery coordination</li>
        <?php endif; ?>
      </ol>
    </div>
    <div data-tracking-section="related-services">
      <h2>Related Services</h2>
      <p class="lead">
        Many projects combine this service with CNC, laser, printing or
        fabrication support for complete delivery.
      </p>
      <a href="/services" class="btn btn-outline" data-tracking-control="all-services">Back to All Services</a>
      <a href="/contact" class="btn" data-tracking-control="request-quote">Request a Quote</a>
    </div>
  </div>
</section>
