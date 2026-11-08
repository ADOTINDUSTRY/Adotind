<?php /** @var array|null $user */ $base='/svg-trace'; ?>
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
        <h3>Workspace</h3>
        <p>The tracing workspace opens in Stage 3–4 of the product rollout.</p>
        <p class="muted">Your files are automatically deleted after 30 days. You can delete them at any time.</p>
      </div>
    </div>
  </div>
</section>
