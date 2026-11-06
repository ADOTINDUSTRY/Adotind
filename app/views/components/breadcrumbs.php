<?php if (!empty($page['breadcrumbs']) && is_array($page['breadcrumbs'])): ?>
  <nav class="breadcrumbs container" aria-label="Breadcrumb">
    <ol>
      <?php foreach ($page['breadcrumbs'] as $index => $crumb): ?>
        <li>
          <?php if ($index === count($page['breadcrumbs']) - 1): ?>
            <span aria-current="page"><?= e($crumb['label']) ?></span>
          <?php else: ?>
            <a href="<?= e($crumb['href']) ?>"><?= e($crumb['label']) ?></a>
          <?php endif; ?>
        </li>
      <?php endforeach; ?>
    </ol>
  </nav>
<?php endif; ?>
