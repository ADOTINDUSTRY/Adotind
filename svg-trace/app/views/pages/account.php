<?php /** @var array|null $user */ $base = '/svg-trace';
$jobs = StJobs::recentForUser((int)$user['id'], 30);
$usedMb = StStorage::userUsageBytes((int)$user['id']) / 1048576;
$quotaMb = StSettings::int('limits', 'storage_mb_per_user');
?>
<section class="section-st">
  <div class="wrap">
    <h1>My account</h1>
    <div class="cards">
      <div class="card">
        <h3>Profile</h3>
        <p><?= StSecurity::e($user['display_name'] ?? '') ?><br />
        <?= StSecurity::e($user['email'] ?? '') ?><br />
        <span class="muted">Member since <?= StSecurity::e(substr((string)($user['created_at'] ?? ''), 0, 10)) ?></span></p>
      </div>
      <div class="card">
        <h3>Storage</h3>
        <p><?= number_format($usedMb, 1) ?> MB of <?= (int)$quotaMb ?> MB used</p>
        <p class="muted">Your files are automatically deleted after 30 days.</p>
        <a class="btn btn-primary" href="<?= $base ?>/trace">Open workspace</a>
      </div>
    </div>

    <h2 style="margin-top:36px">My files</h2>
    <?php if ($jobs === []): ?>
      <p class="muted">No conversions yet. <a href="<?= $base ?>/trace">Trace your first image</a>.</p>
    <?php else: ?>
      <div class="table-scroll">
      <table class="file-list">
        <thead><tr><th>Image</th><th>Status</th><th>SVG size</th><th>Created (UTC)</th><th>Deleted on</th><th></th></tr></thead>
        <tbody>
        <?php foreach ($jobs as $j): ?>
          <tr>
            <td><?= StSecurity::e((string)$j['original_name']) ?><br /><span class="muted fine"><?= (int)$j['width'] ?>×<?= (int)$j['height'] ?> px · <?= StSecurity::e((string)$j['engine']) ?></span></td>
            <td><span class="badge <?= StSecurity::e((string)$j['status']) ?>"><?= StSecurity::e((string)$j['status']) ?></span></td>
            <td><?= $j['out_size'] !== null ? number_format(((int)$j['out_size']) / 1024, 1) . ' KB' : '—' ?></td>
            <td><?= StSecurity::e(substr((string)$j['created_at'], 0, 16)) ?></td>
            <td><?= StSecurity::e(substr((string)$j['expires_at'], 0, 10)) ?></td>
            <td><?php if ($j['status'] === 'completed' && $j['out_size'] !== null): ?>
              <a href="<?= $base ?>/files/<?= (int)$j['output_file_id'] ?>/download">Download SVG</a>
            <?php endif; ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      </div>
    <?php endif; ?>
  </div>
</section>
