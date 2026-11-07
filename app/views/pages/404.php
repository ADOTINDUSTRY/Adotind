<section class="page-hero">
  <div class="container">
    <p class="eyebrow"><?= e(editable_text($page, 'eyebrow', '404')) ?></p>
    <h1><?= e(editable_text($page, 'heading', 'Page Not Found')) ?></h1>
    <p class="lead"><?= e(editable_text($page, 'lead', 'The requested page does not exist or has moved.')) ?></p>
    <?php if (editable_text($page, 'hero_image_url', '') !== ''): ?>
      <div class="hero-media-card page-hero-media">
        <img src="<?= e(editable_text($page, 'hero_image_url', '')) ?>" alt="<?= e(editable_text($page, 'heading', '404 page image')) ?>" loading="lazy" />
      </div>
    <?php endif; ?>
    <div class="cta-group">
      <a href="/" class="btn">Go to Homepage</a>
      <a href="/contact" class="btn btn-outline">Contact Us</a>
    </div>
  </div>
</section>
