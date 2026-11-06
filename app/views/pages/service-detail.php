<?php
$service = $page['service'];
?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow">Service Detail</p>
    <h1><?= e($service['name']) ?></h1>
    <p class="lead"><?= e($service['summary']) ?></p>
  </div>
</section>

<section class="section">
  <div class="container two-col">
    <div>
      <h2>Applications</h2>
      <ul class="feature-list">
        <?php foreach ($service['applications'] as $application): ?>
          <li><?= e($application) ?></li>
        <?php endforeach; ?>
      </ul>
    </div>
    <div>
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
    <div>
      <h2>Manufacturing Process</h2>
      <ol class="process-list">
        <li>Requirement review and technical scope confirmation</li>
        <li>Design and production planning</li>
        <li>Material preparation and manufacturing execution</li>
        <li>Quality checks and finishing</li>
        <li>Delivery coordination</li>
      </ol>
    </div>
    <div>
      <h2>Related Services</h2>
      <p class="lead">
        Many projects combine this service with CNC, laser, printing or
        fabrication support for complete delivery.
      </p>
      <a href="/services" class="btn btn-outline">Back to All Services</a>
      <a href="/contact" class="btn">Request a Quote</a>
    </div>
  </div>
</section>
