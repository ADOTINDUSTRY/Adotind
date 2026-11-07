<?php
$isAuthed = dashboard_is_authenticated();
$media = $page['media'] ?? [];
$success = flash_get('dashboard_success');
$error = flash_get('dashboard_error');
$categories = ['signage', 'illuminated-signs', 'cnc', 'laser-cutting', 'printing', 'fabrication', 'logo'];
$locations = dashboard_location_options();
?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow">Private Dashboard</p>
    <h1>Media Management</h1>
    <p class="lead">Upload project images to a specific website location and manage their details.</p>
  </div>
</section>

<section class="section">
  <div class="container">
    <?php if (is_string($success)): ?>
      <p class="alert alert-success"><?= e($success) ?></p>
    <?php endif; ?>
    <?php if (is_string($error)): ?>
      <p class="alert alert-error"><?= e($error) ?></p>
    <?php endif; ?>

    <?php if (!$isAuthed): ?>
      <div class="service-card dashboard-login-card">
        <h2>Dashboard Login</h2>
        <form class="quote-form" method="post" action="/dashboard/login">
          <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
          <label>Username
            <input type="text" name="username" autocomplete="username" required />
          </label>
          <label>Password
            <input type="password" name="password" autocomplete="current-password" required />
          </label>
          <button type="submit" class="btn">Login</button>
        </form>
      </div>
    <?php else: ?>
      <div class="dashboard-actions">
        <form class="quote-form service-card" method="post" action="/dashboard/upload" enctype="multipart/form-data">
          <h2>Upload Project Images</h2>
          <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
          <label>Select multiple images
            <input type="file" name="photos[]" accept=".jpg,.jpeg,.png,.webp" multiple required />
          </label>
          <label>Display location
            <select name="location">
              <?php foreach ($locations as $value => $label): ?>
                <option value="<?= e($value) ?>"><?= e($label) ?></option>
              <?php endforeach; ?>
            </select>
          </label>
          <button type="submit" class="btn">Upload</button>
        </form>

        <form method="post" action="/dashboard/logout">
          <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
          <button type="submit" class="btn btn-outline">Logout</button>
        </form>
      </div>

      <h2>Uploaded Images</h2>
      <div class="dashboard-media-grid">
        <?php foreach ($media as $item): ?>
          <article class="service-card dashboard-media-card">
            <img src="<?= e($item['url']) ?>" alt="<?= e($item['title'] ?? 'Project image') ?>" loading="lazy" />
            <form method="post" action="/dashboard/set-logo">
              <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
              <input type="hidden" name="id" value="<?= e((string)($item['id'] ?? '')) ?>" />
              <button type="submit" class="btn btn-outline btn-small">Use as Company Logo</button>
            </form>
            <form method="post" action="/dashboard/delete-media" onsubmit="return confirm('Delete this image permanently?');">
              <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
              <input type="hidden" name="id" value="<?= e((string)($item['id'] ?? '')) ?>" />
              <button type="submit" class="btn btn-outline btn-small btn-danger">Delete Image</button>
            </form>
            <form class="quote-form" method="post" action="/dashboard/update-media">
              <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
              <input type="hidden" name="id" value="<?= e((string)($item['id'] ?? '')) ?>" />
              <label>Title
                <input type="text" name="title" value="<?= e((string)($item['title'] ?? '')) ?>" />
              </label>
              <label>Description
                <textarea name="description" rows="3"><?= e((string)($item['description'] ?? '')) ?></textarea>
              </label>
              <label>Category
                <select name="category">
                  <?php foreach ($categories as $category): ?>
                    <?php $selected = (($item['category'] ?? '') === $category) ? 'selected' : ''; ?>
                    <option value="<?= e($category) ?>" <?= $selected ?>><?= e(ucwords(str_replace('-', ' ', $category))) ?></option>
                  <?php endforeach; ?>
                </select>
              </label>
              <label>Display location
                <select name="location">
                  <?php foreach ($locations as $value => $label): ?>
                    <?php $selected = (($item['location'] ?? 'portfolio-gallery') === $value) ? 'selected' : ''; ?>
                    <option value="<?= e($value) ?>" <?= $selected ?>><?= e($label) ?></option>
                  <?php endforeach; ?>
                </select>
              </label>
              <button type="submit" class="btn">Save</button>
            </form>
          </article>
        <?php endforeach; ?>
        <?php if ($media === []): ?>
          <p class="muted">No images uploaded yet.</p>
        <?php endif; ?>
      </div>
    <?php endif; ?>
  </div>
</section>
