<footer class="site-footer">
  <div class="container footer-grid">
    <div>
      <h2><?= e($siteConfig['brand']) ?></h2>
      <p class="muted">
        <?= e($siteConfig['legal_name']) ?> delivers industrial signage,
        machining and fabrication solutions in <?= e($siteConfig['country']) ?>.
      </p>
    </div>
    <div>
      <h3>Contact</h3>
      <p><a href="tel:<?= e($siteConfig['phone_href']) ?>"><?= e($siteConfig['phone']) ?></a></p>
      <p><a href="mailto:<?= e($siteConfig['email']) ?>"><?= e($siteConfig['email']) ?></a></p>
      <p><a href="<?= e($siteConfig['whatsapp']) ?>" target="_blank" rel="noopener noreferrer">WhatsApp / Viber</a></p>
    </div>
  </div>
  <div class="container footer-bottom">
    <p>&copy; <?= date('Y') ?> <?= e($siteConfig['brand']) ?>. All rights reserved.</p>
  </div>
</footer>
