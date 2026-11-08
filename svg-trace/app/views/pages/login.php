<?php /** @var array $page */ $base='/svg-trace'; ?>
<section class="section-st">
  <div class="wrap auth-card">
    <?php if (!empty($page['is_guest'])): ?>
      <h1>Save your files</h1>
      <p class="muted">You are using SVG Trace as a guest. Sign in and everything you made so far moves into your account.</p>
    <?php else: ?>
      <h1>Start tracing</h1>
      <p class="muted">Use it right away as a guest, or sign in to keep your files on any device.</p>
    <?php endif; ?>

    <?php if (!empty($page['error'])): ?>
      <p class="alert-st alert-err"><?= StSecurity::e($page['error']) ?></p>
    <?php endif; ?>
    <?php if (!empty($page['sent'])): ?>
      <p class="alert-st alert-ok">If an account can use <strong><?= StSecurity::e($page['sent']) ?></strong>, a sign-in link is on its way. Check your inbox (and spam folder). The link is valid for 15 minutes.</p>
    <?php endif; ?>

    <?php if (empty($page['is_guest'])): ?>
      <form method="post" action="<?= $base ?>/auth/guest" class="auth-guest">
        <?= StSecurity::csrfField() ?>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Continue as guest</button>
        <p class="fine">No sign-up. Your files stay in this browser only — download what you need.</p>
      </form>
      <div class="auth-or"><span>or sign in</span></div>
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
      <button class="btn <?= empty($page['is_guest']) ? 'btn-ghost' : 'btn-primary' ?>" type="submit">Email me a sign-in link</button>
    </form>
    <p class="fine">No password to remember. By continuing you accept our <a href="<?= $base ?>/terms">terms</a> and <a href="<?= $base ?>/privacy">privacy policy</a>.</p>
  </div>
</section>
