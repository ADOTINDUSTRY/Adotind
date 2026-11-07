<?php
$project = $page['project'];
?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow">Project Detail</p>
    <h1><?= e($project['title']) ?></h1>
    <p class="lead"><?= e($project['description']) ?></p>
  </div>
</section>

<section class="section">
  <div class="container two-col">
    <div>
      <h2>Materials Used</h2>
      <ul class="feature-list">
        <?php foreach ($project['materials'] as $material): ?>
          <li><?= e($material) ?></li>
        <?php endforeach; ?>
      </ul>
    </div>
    <div>
      <h2>Manufacturing Techniques</h2>
      <ul class="feature-list">
        <?php foreach ($project['techniques'] as $technique): ?>
          <li><?= e($technique) ?></li>
        <?php endforeach; ?>
      </ul>
    </div>
  </div>
</section>

<section class="section section-dark">
  <div class="container">
    <h2>Project Assets Status</h2>
    <p class="lead">
      This entry is a structured placeholder. Confirmed photography, technical
      process notes and final project documentation will be published once
      approved.
    </p>
    <a href="/portfolio" class="btn btn-outline">Back to Portfolio</a>
  </div>
</section>
