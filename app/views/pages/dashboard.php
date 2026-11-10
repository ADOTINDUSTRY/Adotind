<?php
$isAuthed = dashboard_is_authenticated();
$media = $page['media'] ?? [];
$success = flash_get('dashboard_success');
$error = flash_get('dashboard_error');
$categories = ['signage', 'illuminated-signs', 'cnc', 'laser-cutting', 'printing', 'fabrication', 'logo'];
$locations = dashboard_location_options();
$quoteAdmin = is_array($page['quote_admin'] ?? null) ? $page['quote_admin'] : ['machines' => [], 'materials' => [], 'rates' => [], 'settings' => [], 'orders' => []];
$quoteSettings = is_array($quoteAdmin['settings'] ?? null) ? $quoteAdmin['settings'] : [];
?>
<section class="page-hero">
  <div class="container">
    <?php if (!$isAuthed): ?>
    <p class="eyebrow">Restricted Area</p>
    <h1>Authorised Access Only</h1>
    <p class="lead">This area is private. Please sign in to continue.</p>
    <?php else: ?>
    <p class="eyebrow">Private Dashboard</p>
    <h1>Media Management</h1>
    <p class="lead">Upload project images to a specific website location and manage their details.</p>
    <?php endif; ?>
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

      <hr class="dashboard-divider" />
      <h2>Quote System Settings (Database)</h2>
      <form class="quote-form service-card dashboard-settings-card" method="post" action="/dashboard/quote/settings">
        <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
        <div class="dashboard-table-grid">
          <label>Currency symbol
            <input type="text" name="currency_symbol" value="<?= e((string)($quoteSettings['currency_symbol'] ?? '€')) ?>" />
          </label>
          <label>VAT %
            <input type="number" name="vat_percent" min="0" step="0.01" value="<?= e((string)($quoteSettings['vat_percent'] ?? '19')) ?>" />
          </label>
          <label>Markup %
            <input type="number" name="markup_percent" min="0" step="0.01" value="<?= e((string)($quoteSettings['markup_percent'] ?? '0')) ?>" />
          </label>
          <label>Round-to step
            <input type="number" name="round_to" min="0" step="0.01" value="<?= e((string)($quoteSettings['round_to'] ?? '0.5')) ?>" />
          </label>
          <label>Instant measure extensions
            <input type="text" name="instant_exts" value="<?= e((string)($quoteSettings['instant_exts'] ?? 'svg,dxf')) ?>" />
          </label>
        </div>
        <button type="submit" class="btn">Save Quote Settings</button>
      </form>

      <h2>Machines</h2>
      <div class="dashboard-table-wrap">
        <table class="dashboard-table">
          <thead>
            <tr><th>Name</th><th>Code</th><th>Setup min</th><th>Setup cost</th><th>Hourly</th><th>Min charge</th><th>Sort</th><th>Active</th><th>Actions</th></tr>
          </thead>
          <tbody>
            <?php foreach (($quoteAdmin['machines'] ?? []) as $machine): ?>
            <tr>
              <form method="post" action="/dashboard/quote/machine">
                <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
                <input type="hidden" name="id" value="<?= e((string)$machine['id']) ?>" />
                <td><input type="text" name="name" value="<?= e((string)$machine['name']) ?>" required /></td>
                <td><input type="text" name="code" value="<?= e((string)$machine['code']) ?>" required /></td>
                <td><input type="number" name="setup_minutes" min="0" step="0.01" value="<?= e((string)$machine['setup_minutes']) ?>" /></td>
                <td><input type="number" name="setup_cost" min="0" step="0.01" value="<?= e((string)$machine['setup_cost']) ?>" /></td>
                <td><input type="number" name="hourly_rate" min="0" step="0.01" value="<?= e((string)$machine['hourly_rate']) ?>" /></td>
                <td><input type="number" name="min_charge" min="0" step="0.01" value="<?= e((string)$machine['min_charge']) ?>" /></td>
                <td><input type="number" name="sort_order" step="1" value="<?= e((string)$machine['sort_order']) ?>" /></td>
                <td><input type="checkbox" name="active" value="1" <?= ((int)$machine['active'] === 1) ? 'checked' : '' ?> /></td>
                <td class="dashboard-table-actions">
                  <button type="submit" class="btn btn-small">Save</button>
                  <button type="submit" class="btn btn-small btn-danger" name="action" value="delete" onclick="return confirm('Delete this machine?');">Delete</button>
                </td>
              </form>
            </tr>
            <?php endforeach; ?>
            <tr>
              <form method="post" action="/dashboard/quote/machine">
                <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
                <td><input type="text" name="name" placeholder="New machine" required /></td>
                <td><input type="text" name="code" placeholder="code" required /></td>
                <td><input type="number" name="setup_minutes" min="0" step="0.01" value="10" /></td>
                <td><input type="number" name="setup_cost" min="0" step="0.01" value="0" /></td>
                <td><input type="number" name="hourly_rate" min="0" step="0.01" value="75" /></td>
                <td><input type="number" name="min_charge" min="0" step="0.01" value="35" /></td>
                <td><input type="number" name="sort_order" step="1" value="999" /></td>
                <td><input type="checkbox" name="active" value="1" checked /></td>
                <td><button type="submit" class="btn btn-small">Add</button></td>
              </form>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Materials</h2>
      <div class="dashboard-table-wrap">
        <table class="dashboard-table">
          <thead>
            <tr><th>Name</th><th>Sheet W mm</th><th>Sheet H mm</th><th>Sheet price</th><th>Waste %</th><th>Sort</th><th>Active</th><th>Actions</th></tr>
          </thead>
          <tbody>
            <?php foreach (($quoteAdmin['materials'] ?? []) as $material): ?>
            <tr>
              <form method="post" action="/dashboard/quote/material">
                <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
                <input type="hidden" name="id" value="<?= e((string)$material['id']) ?>" />
                <td><input type="text" name="name" value="<?= e((string)$material['name']) ?>" required /></td>
                <td><input type="number" name="sheet_width_mm" min="1" step="0.01" value="<?= e((string)$material['sheet_width_mm']) ?>" /></td>
                <td><input type="number" name="sheet_height_mm" min="1" step="0.01" value="<?= e((string)$material['sheet_height_mm']) ?>" /></td>
                <td><input type="number" name="sheet_price" min="0" step="0.01" value="<?= e((string)$material['sheet_price']) ?>" /></td>
                <td><input type="number" name="waste_percent" min="0" step="0.01" value="<?= e((string)$material['waste_percent']) ?>" /></td>
                <td><input type="number" name="sort_order" step="1" value="<?= e((string)$material['sort_order']) ?>" /></td>
                <td><input type="checkbox" name="active" value="1" <?= ((int)$material['active'] === 1) ? 'checked' : '' ?> /></td>
                <td class="dashboard-table-actions">
                  <button type="submit" class="btn btn-small">Save</button>
                  <button type="submit" class="btn btn-small btn-danger" name="action" value="delete" onclick="return confirm('Delete this material?');">Delete</button>
                </td>
              </form>
            </tr>
            <?php endforeach; ?>
            <tr>
              <form method="post" action="/dashboard/quote/material">
                <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
                <td><input type="text" name="name" placeholder="New material" required /></td>
                <td><input type="number" name="sheet_width_mm" min="1" step="0.01" value="2440" /></td>
                <td><input type="number" name="sheet_height_mm" min="1" step="0.01" value="1220" /></td>
                <td><input type="number" name="sheet_price" min="0" step="0.01" value="0" /></td>
                <td><input type="number" name="waste_percent" min="0" step="0.01" value="10" /></td>
                <td><input type="number" name="sort_order" step="1" value="999" /></td>
                <td><input type="checkbox" name="active" value="1" checked /></td>
                <td><button type="submit" class="btn btn-small">Add</button></td>
              </form>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Cutting Speeds (Machine × Material)</h2>
      <div class="dashboard-table-wrap">
        <table class="dashboard-table">
          <thead>
            <tr><th>Machine</th><th>Material</th><th>Speed mm/min</th><th>Pierce sec/part</th><th>Active</th><th>Actions</th></tr>
          </thead>
          <tbody>
            <?php foreach (($quoteAdmin['rates'] ?? []) as $rate): ?>
            <tr>
              <form method="post" action="/dashboard/quote/rate">
                <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
                <input type="hidden" name="id" value="<?= e((string)$rate['id']) ?>" />
                <td>
                  <select name="machine_id">
                    <?php foreach (($quoteAdmin['machines'] ?? []) as $machine): ?>
                      <option value="<?= e((string)$machine['id']) ?>" <?= ((int)$machine['id'] === (int)$rate['machine_id']) ? 'selected' : '' ?>><?= e((string)$machine['name']) ?></option>
                    <?php endforeach; ?>
                  </select>
                </td>
                <td>
                  <select name="material_id">
                    <?php foreach (($quoteAdmin['materials'] ?? []) as $material): ?>
                      <option value="<?= e((string)$material['id']) ?>" <?= ((int)$material['id'] === (int)$rate['material_id']) ? 'selected' : '' ?>><?= e((string)$material['name']) ?></option>
                    <?php endforeach; ?>
                  </select>
                </td>
                <td><input type="number" name="cut_speed_mm_min" min="0.1" step="0.01" value="<?= e((string)$rate['cut_speed_mm_min']) ?>" /></td>
                <td><input type="number" name="pierce_time_sec" min="0" step="0.01" value="<?= e((string)$rate['pierce_time_sec']) ?>" /></td>
                <td><input type="checkbox" name="active" value="1" <?= ((int)$rate['active'] === 1) ? 'checked' : '' ?> /></td>
                <td class="dashboard-table-actions">
                  <button type="submit" class="btn btn-small">Save</button>
                  <button type="submit" class="btn btn-small btn-danger" name="action" value="delete" onclick="return confirm('Delete this speed entry?');">Delete</button>
                </td>
              </form>
            </tr>
            <?php endforeach; ?>
            <tr>
              <form method="post" action="/dashboard/quote/rate">
                <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
                <td>
                  <select name="machine_id" required>
                    <option value="">Select machine</option>
                    <?php foreach (($quoteAdmin['machines'] ?? []) as $machine): ?>
                      <option value="<?= e((string)$machine['id']) ?>"><?= e((string)$machine['name']) ?></option>
                    <?php endforeach; ?>
                  </select>
                </td>
                <td>
                  <select name="material_id" required>
                    <option value="">Select material</option>
                    <?php foreach (($quoteAdmin['materials'] ?? []) as $material): ?>
                      <option value="<?= e((string)$material['id']) ?>"><?= e((string)$material['name']) ?></option>
                    <?php endforeach; ?>
                  </select>
                </td>
                <td><input type="number" name="cut_speed_mm_min" min="0.1" step="0.01" value="1000" required /></td>
                <td><input type="number" name="pierce_time_sec" min="0" step="0.01" value="0" /></td>
                <td><input type="checkbox" name="active" value="1" checked /></td>
                <td><button type="submit" class="btn btn-small">Add</button></td>
              </form>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Quote Orders</h2>
      <div class="dashboard-table-wrap">
        <table class="dashboard-table">
          <thead>
            <tr><th>ID</th><th>Date</th><th>Customer</th><th>Machine</th><th>Material</th><th>Qty</th><th>Length (mm)</th><th>Total</th><th>Status</th></tr>
          </thead>
          <tbody>
            <?php foreach (($quoteAdmin['orders'] ?? []) as $order): ?>
            <tr>
              <td>#<?= e((string)$order['id']) ?></td>
              <td><?= e((string)$order['created_at']) ?></td>
              <td><?= e((string)$order['customer_name']) ?><br /><small><?= e((string)$order['email']) ?></small></td>
              <td><?= e((string)$order['machine_name']) ?></td>
              <td><?= e((string)$order['material_name']) ?></td>
              <td><?= e((string)$order['quantity']) ?></td>
              <td><?= e((string)round((float)$order['vector_length_mm'], 2)) ?></td>
              <td><?= e((string)number_format((float)$order['estimate_total'], 2)) ?></td>
              <td><?= e((string)$order['status']) ?></td>
            </tr>
            <?php endforeach; ?>
            <?php if (($quoteAdmin['orders'] ?? []) === []): ?>
              <tr><td colspan="9" class="muted">No quote orders yet.</td></tr>
            <?php endif; ?>
          </tbody>
        </table>
      </div>
    <?php endif; ?>
  </div>
</section>
