<footer class="site-footer">
  <div class="container footer-grid">
    <div>
      <div class="footer-brand">
        <img
          class="footer-logo"
          src="<?= e($siteConfig['logo_url']) ?>"
          alt="<?= e($siteConfig['brand']) ?> logo"
          width="58"
          height="58"
          decoding="async"
          onerror="this.onerror=null;this.src='/public/assets/images/adotind-logo.svg';"
        />
        <h2><?= e($siteConfig['brand']) ?></h2>
      </div>
      <p class="muted">
        <?= e($siteConfig['legal_name']) ?> delivers industrial signage,
        machining and fabrication solutions in <?= e($siteConfig['country']) ?>.
      </p>
    </div>
    <div>
      <h3>Contact</h3>
      <p>
        <a href="<?= e($siteConfig['maps_url']) ?>" target="_blank" rel="noopener noreferrer">
          <?= e($siteConfig['location_text']) ?>
        </a>
      </p>
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
