<?php /** @var array $page */ $base='/svg-trace'; ?>
<section class="section-st">
  <div class="wrap auth-card">
    <h1>Sign in or create your account</h1>
    <p class="muted">One account for Google, Facebook or email — they all link to the same profile.</p>

    <?php if (!empty($page['error'])): ?>
      <p class="alert-st alert-err"><?= StSecurity::e($page['error']) ?></p>
    <?php endif; ?>
    <?php if (!empty($page['sent'])): ?>
      <p class="alert-st alert-ok">If an account can use <strong><?= StSecurity::e($page['sent']) ?></strong>, a sign-in link is on its way. Check your inbox (and spam folder). The link is valid for 15 minutes.</p>
    <?php endif; ?>

    <div class="auth-providers">
      <?php if (!empty($page['google_enabled'])): ?>
        <a class="btn btn-oauth" href="<?= $base ?>/auth/google">Continue with Google</a>
      <?php endif; ?>
      <?php if (!empty($page['facebook_enabled'])): ?>
        <a class="btn btn-oauth" href="<?= $base ?>/auth/facebook">Continue with Facebook</a>
      <?php endif; ?>
    </div>

    <form method="post" action="<?= $base ?>/auth/email" class="auth-email">
      <?= StSecurity::csrfField() ?>
      <label>Email address
        <input type="email" name="email" required maxlength="190" autocomplete="email" placeholder="you@company.com" />
      </label>
      <button class="btn btn-primary" type="submit">Email me a sign-in link</button>
    </form>
    <p class="fine">No password to remember. By continuing you accept our <a href="<?= $base ?>/terms">terms</a> and <a href="<?= $base ?>/privacy">privacy policy</a>.</p>
  </div>
</section>
