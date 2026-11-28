<?php $landing = $page['landing']; ?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow">Manufacturing Services in Cyprus</p>
    <h1><?= e($landing['name']) ?></h1>
    <p class="lead"><?= e($landing['summary']) ?></p>
    <div class="cta-group">
      <?php if ($landing['workflow'] !== null): ?>
      <a class="btn" href="/online-quote?project=<?= e($landing['workflow']) ?>">Start this project</a>
      <?php endif; ?>
      <a class="btn btn-outline" href="/contact">Discuss your project</a>
    </div>
    <?php if ($landing['workflow'] !== null): ?><p>Online quotation tools are currently in private testing.</p><?php endif; ?>
  </div>
</section>
<section class="section" data-tracking-section="service-overview">
  <div class="container two-col">
    <div><h2>How we can help</h2><p class="lead"><?= e($landing['intro']) ?></p>
      <h3>Common applications</h3><ul class="feature-list"><?php foreach ($landing['uses'] as $item): ?><li><?= e($item) ?></li><?php endforeach; ?></ul>
    </div>
    <div><h2>Planning your project</h2><ul class="feature-list"><?php foreach ($landing['details'] as $item): ?><li><?= e($item) ?></li><?php endforeach; ?></ul></div>
  </div>
</section>
<section class="section section-dark">
  <div class="container two-col">
    <div><h2><?= e($landing['question']) ?></h2><p><?= e($landing['answer']) ?></p></div>
    <div><h2>Explore related services</h2><p>Compare processes and find the best starting point for your project.</p>
      <a class="btn btn-outline" href="/services/<?= e($landing['parent']) ?>">View related capabilities</a>
      <a class="btn" href="/services">All services</a>
    </div>
  </div>
</section>
