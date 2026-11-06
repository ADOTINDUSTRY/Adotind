<?php
$is404 = !empty($page['is404']);
?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow"><?= $is404 ? '404' : 'In Progress' ?></p>
    <h1><?= e($page['heading'] ?? 'Page') ?></h1>
    <p class="lead">
      <?= $is404
          ? 'The page you requested could not be found.'
          : 'This section is being finalized as part of the full premium website rollout.' ?>
    </p>
    <div class="cta-group">
      <a href="/" class="btn">Back to Home</a>
      <a href="/contact" class="btn btn-outline">Request a Quote</a>
    </div>
  </div>
</section>
