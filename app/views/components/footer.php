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
      <p><?= e($siteConfig['location_text']) ?></p>
      <p><a href="tel:<?= e($siteConfig['phone_href']) ?>"><?= e($siteConfig['phone']) ?></a></p>
      <p><a href="mailto:<?= e($siteConfig['email']) ?>"><?= e($siteConfig['email']) ?></a></p>
      <div class="social-links" aria-label="Social links">
        <a href="<?= e($siteConfig['whatsapp']) ?>" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
          <img src="https://cdn.simpleicons.org/whatsapp/25D366" alt="WhatsApp" loading="lazy" />
        </a>
        <a href="<?= e($siteConfig['viber']) ?>" aria-label="Viber">
          <img src="https://cdn.simpleicons.org/viber/7360F2" alt="Viber" loading="lazy" />
        </a>
        <a href="<?= e($siteConfig['facebook']) ?>" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
          <img src="https://cdn.simpleicons.org/facebook/1877F2" alt="Facebook" loading="lazy" />
        </a>
      </div>
    </div>
  </div>
  <div class="container footer-bottom">
    <p>&copy; <?= date('Y') ?> <?= e($siteConfig['legal_name']) ?>. All rights reserved.</p>
  </div>
</footer>
