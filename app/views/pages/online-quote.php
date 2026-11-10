<?php
$pinError = flash_get('online_quote_pin_error');
$pinSuccess = flash_get('online_quote_pin_success');
$updatesError = flash_get('online_quote_updates_error');
$updatesSuccess = flash_get('online_quote_updates_success');
$unlocked = !empty($page['quote_unlocked']);
?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow">Online Quote Portal</p>
    <h1>CO2 Laser, Fiber Laser & CNC Router Quotation</h1>
    <p class="lead">
      This page is currently in private testing mode. Final public release will include automatic vector-file checks,
      instant pricing, and online booking.
    </p>
  </div>
</section>

<section class="section section-light">
  <div class="container two-col quote-gate-grid">
    <div class="service-card quote-lock-card">
      <h2>Testing Access</h2>
      <p>Temporary PIN protection is enabled while we tune pricing and workflow.</p>
      <?php if (is_string($pinSuccess)): ?>
        <p class="alert alert-success"><?= e($pinSuccess) ?></p>
      <?php endif; ?>
      <?php if (is_string($pinError)): ?>
        <p class="alert alert-error"><?= e($pinError) ?></p>
      <?php endif; ?>
      <?php if (!$unlocked): ?>
        <form action="/online-quote/pin" method="post" class="quote-form quote-pin-form" novalidate>
          <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
          <label>Enter testing PIN
            <input type="password" name="pin" inputmode="numeric" maxlength="12" placeholder="PIN" required />
          </label>
          <button type="submit" class="btn">Unlock Testing Mode</button>
        </form>
      <?php else: ?>
        <p class="alert alert-success">Testing mode is unlocked in this browser session.</p>
      <?php endif; ?>
    </div>

    <div class="service-card">
      <h2>Coming Soon — Under Development</h2>
      <p>
        We are building full online quotation and booking for:
      </p>
      <ul class="feature-list quote-feature-list">
        <li>CO2 Laser Cutting</li>
        <li>Fiber Laser Cutting</li>
        <li>CNC Router Cutting</li>
        <li>Vector file upload + material-based price engine</li>
      </ul>

      <?php if (is_string($updatesSuccess)): ?>
        <p class="alert alert-success"><?= e($updatesSuccess) ?></p>
      <?php endif; ?>
      <?php if (is_string($updatesError)): ?>
        <p class="alert alert-error"><?= e($updatesError) ?></p>
      <?php endif; ?>
      <form action="/online-quote/updates" method="post" class="quote-form quote-updates-form" novalidate>
        <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
        <label>Email for launch updates
          <input type="email" name="email" placeholder="you@example.com" required />
        </label>
        <button type="submit" class="btn btn-outline">Notify Me</button>
      </form>

      <div class="cta-group quote-help-cta">
        <a class="btn" href="<?= e($siteConfig['whatsapp']) ?>" target="_blank" rel="noopener noreferrer">
          Need a quote now? WhatsApp us
        </a>
        <a class="btn btn-outline" href="<?= e($siteConfig['viber']) ?>">
          Or chat on Viber
        </a>
      </div>
    </div>
  </div>
</section>

<?php if ($unlocked): ?>
<section class="section">
  <div class="container">
    <h2>Prototype Quotation (Testing)</h2>
    <p class="muted">
      Internal testing estimator. Final production logic and exact pricing rules are still being tuned.
    </p>
    <form class="quote-form quote-prototype" id="online-quote-prototype" novalidate>
      <div class="quote-prototype-grid">
        <label>Process
          <select name="machine" id="quote-machine" required>
            <option value="co2">CO2 Laser</option>
            <option value="fiber">Fiber Laser</option>
            <option value="cnc">CNC Router</option>
          </select>
        </label>
        <label>Material
          <select name="material" id="quote-material" required>
            <option value="acrylic">Acrylic</option>
            <option value="mdf">MDF / Plywood</option>
            <option value="steel">Mild Steel</option>
            <option value="stainless">Stainless Steel</option>
            <option value="aluminium">Aluminium</option>
            <option value="pvc">PVC / Foamex</option>
          </select>
        </label>
        <label>Length (mm)
          <input type="number" id="quote-length" min="1" step="1" value="500" required />
        </label>
        <label>Width (mm)
          <input type="number" id="quote-width" min="1" step="1" value="300" required />
        </label>
        <label>Quantity
          <input type="number" id="quote-qty" min="1" step="1" value="1" required />
        </label>
        <label>Complexity
          <select id="quote-complexity">
            <option value="1">Simple</option>
            <option value="1.25">Normal</option>
            <option value="1.55">Detailed</option>
          </select>
        </label>
      </div>
      <label>Vector file (for final production quote)
        <input type="file" id="quote-file" accept=".svg,.dxf,.ai,.eps,.pdf" />
      </label>
      <div class="quote-estimate-card">
        <p class="muted">Estimated price (testing):</p>
        <p class="quote-estimate-amount" id="quote-estimate-amount">€0.00</p>
        <p class="small-note">This is a temporary estimate for testing only. Final quoted price is confirmed by factory review.</p>
      </div>
      <div class="cta-group">
        <button type="button" class="btn" id="quote-calc">Calculate Estimate</button>
        <a class="btn btn-outline" id="quote-book-wa" href="<?= e($siteConfig['whatsapp']) ?>" target="_blank" rel="noopener noreferrer">
          Book by WhatsApp
        </a>
        <a class="btn btn-outline" id="quote-book-viber" href="<?= e($siteConfig['viber']) ?>">
          Book by Viber
        </a>
      </div>
    </form>
  </div>
</section>
<?php endif; ?>
