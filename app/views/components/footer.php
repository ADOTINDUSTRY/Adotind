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
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.4A10 10 0 1 0 12 2Zm5.2 14.5c-.2.6-1.2 1.1-1.7 1.2-.5 0-1.1.2-3.6-.8-3-1.3-5-4.4-5.2-4.7-.2-.3-1.2-1.5-1.2-2.9s.7-2 1-2.3c.3-.3.7-.4 1-.4h.7c.2 0 .5 0 .8.7.3.7 1 2.4 1.1 2.6.1.2.1.4 0 .7s-.2.4-.4.7c-.2.2-.3.4-.5.6-.2.2-.4.4-.2.8.2.4.9 1.4 1.9 2.3 1.3 1.1 2.3 1.5 2.7 1.7.4.2.6.1.9-.1.3-.3 1-1.1 1.2-1.5.2-.4.5-.3.8-.2.3.1 2 .9 2.4 1 .4.2.6.3.6.5 0 .2 0 1.1-.2 1.7Z"/></svg>
        </a>
        <a href="<?= e($siteConfig['viber']) ?>" aria-label="Viber">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.2 4.8c-1.8-1.7-4.3-2.5-7.3-2.5H7.8A5.8 5.8 0 0 0 2 8v7.6c0 3.2 2.6 5.8 5.8 5.8h.4v2.1c0 .4.4.7.8.5l3.4-2.6h.6c3.2 0 5.8-2.6 5.8-5.8V8.8c0-1.6-.6-3-1.8-4Zm-1.1 10.8c0 2.4-2 4.4-4.4 4.4h-.8l-2.8 2.1v-2.1H7.8c-2.4 0-4.4-2-4.4-4.4V8c0-2.4 2-4.4 4.4-4.4h4.1c2.6 0 4.8.7 6.3 2.1 1 1 1.6 2.3 1.6 3.9v6Z"/><path d="M8.6 8.7c-.3.1-.7.6-.8 1.3-.1.8.2 1.8.9 2.9.6 1.1 1.5 2 2.6 2.7 1 .7 2 .9 2.9.8.7-.1 1.2-.5 1.3-.8.1-.3.1-.5 0-.7l-.7-.9c-.2-.2-.4-.2-.7 0l-.6.4c-.2.1-.4.1-.6 0-.6-.3-1.3-1-1.6-1.6-.1-.2-.1-.4 0-.6l.4-.6c.2-.3.2-.5 0-.7l-.9-.7c-.2-.1-.4-.1-.7 0Z"/></svg>
        </a>
        <a href="<?= e($siteConfig['facebook']) ?>" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7h-2.1V12h2.1V9.8c0-2.1 1.2-3.2 3.1-3.2.9 0 1.9.2 1.9.2v2h-1.1c-1 0-1.3.6-1.3 1.3V12h2.3l-.4 2.9H13v7A10 10 0 0 0 22 12Z"/></svg>
        </a>
      </div>
    </div>
  </div>
  <div class="container footer-bottom">
    <p>&copy; <?= date('Y') ?> <?= e($siteConfig['legal_name']) ?>. All rights reserved.</p>
  </div>
</footer>
