<?php
$pinError = flash_get('online_quote_pin_error');
$pinSuccess = flash_get('online_quote_pin_success');
$updatesError = flash_get('online_quote_updates_error');
$updatesSuccess = flash_get('online_quote_updates_success');
$quoteError = flash_get('online_quote_error');
$quoteSuccess = flash_get('online_quote_success');
$unlocked = !empty($page['quote_unlocked']);
$quoteData = $page['quote_data'] ?? ['machines' => [], 'materials' => [], 'rates' => [], 'settings' => []];
$machines = is_array($quoteData['machines'] ?? null) ? $quoteData['machines'] : [];
$materials = is_array($quoteData['materials'] ?? null) ? $quoteData['materials'] : [];
$settings = is_array($quoteData['settings'] ?? null) ? $quoteData['settings'] : [];
$result = is_array($page['quote_result'] ?? null) ? $page['quote_result'] : null;
$currency = (string)($settings['currency_symbol'] ?? '€');
$waBase = (string)($siteConfig['whatsapp'] ?? '');
$viberBase = (string)($siteConfig['viber'] ?? '');
?>
<section class="page-hero quote-hero">
  <div class="container quote-hero-inner">
    <div>
      <p class="eyebrow">Online Quote</p>
      <h1>Make your next idea a reality.</h1>
      <p class="lead">From your vector file to a manufacturing estimate. Choose your process, material and dimensions to get started.</p>
    </div>
    <div class="quote-processes" aria-label="Available processes">
      <span>CO2 Laser</span><span>Fiber Laser</span><span>CNC Router</span>
    </div>
  </div>
</section>

<?php if (!$unlocked): ?>
<section class="section section-light quote-page">
  <div class="container two-col quote-gate-grid">
    <div class="quote-card quote-lock-card">
      <p class="quote-card-kicker">For testers</p>
      <h2>Private Testing Access</h2>
      <p>This page is temporarily PIN-protected while we finalize production settings.</p>
      <?php if (is_string($pinSuccess)): ?><p class="alert alert-success"><?= e($pinSuccess) ?></p><?php endif; ?>
      <?php if (is_string($pinError)): ?><p class="alert alert-error"><?= e($pinError) ?></p><?php endif; ?>
      <form action="/online-quote/pin" method="post" class="quote-form quote-pin-form" novalidate>
        <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
        <label>Enter PIN
          <input type="password" name="pin" inputmode="numeric" maxlength="12" placeholder="PIN" required />
        </label>
        <button type="submit" class="btn">Open Quote System</button>
      </form>
    </div>

    <div class="quote-card">
      <p class="quote-card-kicker">Something new is on its way</p>
      <h2>Coming Soon — Under Development</h2>
      <p>Public launch is in progress. Leave your email and we will notify you when this system goes live.</p>
      <?php if (is_string($updatesSuccess)): ?><p class="alert alert-success"><?= e($updatesSuccess) ?></p><?php endif; ?>
      <?php if (is_string($updatesError)): ?><p class="alert alert-error"><?= e($updatesError) ?></p><?php endif; ?>
      <form action="/online-quote/updates" method="post" class="quote-form quote-updates-form" novalidate>
        <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
        <label>Email for updates
          <input type="email" name="email" placeholder="you@example.com" required />
        </label>
        <button type="submit" class="btn btn-outline">Notify Me</button>
      </form>
      <div class="cta-group quote-help-cta">
        <a class="btn" href="<?= e($waBase) ?>" target="_blank" rel="noopener noreferrer">Need quotation now? WhatsApp</a>
        <a class="btn btn-outline" href="<?= e($viberBase) ?>">Need quotation now? Viber</a>
      </div>
    </div>
  </div>
</section>
<?php else: ?>
<section class="section section-light quote-page">
  <div class="container quote-workspace">
    <?php if (is_string($pinSuccess)): ?><p class="alert alert-success"><?= e($pinSuccess) ?></p><?php endif; ?>
    <?php if (is_string($quoteSuccess)): ?><p class="alert alert-success"><?= e($quoteSuccess) ?></p><?php endif; ?>
    <?php if (is_string($quoteError)): ?><p class="alert alert-error"><?= e($quoteError) ?></p><?php endif; ?>

    <form class="quote-form quote-prototype" method="post" action="/online-quote/calculate" enctype="multipart/form-data" novalidate>
      <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
      <div class="quote-form-intro">
        <div>
          <p class="quote-card-kicker">Your project</p>
          <h2>Let's build your quote</h2>
          <p>Tell us what you need cut and upload your design.</p>
        </div>
      </div>
      <div class="quote-step-heading">
        <span aria-hidden="true">01</span>
        <div><h3>Upload your design</h3><p>Start by choosing the vector file for your project.</p></div>
      </div>
      <div class="quote-upload">
        <label>Vector file
          <input type="file" name="vector_file" accept=".svg,.dxf,.pdf,.ai,.eps" aria-describedby="quote-file-help" required />
        </label>
        <p id="quote-file-help">Instant quotes require SVG or DXF. For PDF, AI or EPS, contact us for a manual quotation. Maximum file size: 50 MB.</p>
        <div class="quote-file-preview" hidden aria-live="polite">
          <div class="quote-preview-image" hidden><img alt="Preview of the selected SVG design" /><div class="quote-preview-render" hidden aria-label="Drawing preview"></div></div>
          <div class="quote-preview-details">
            <strong class="quote-preview-name"></strong>
            <p class="quote-preview-size"></p>
            <p class="quote-preview-dimensions"></p>
            <p class="quote-preview-message"></p>
          </div>
        </div>
      </div>
      <div class="quote-step-heading">
        <span aria-hidden="true">02</span>
        <div><h3>Choose your process</h3><p>Select the machine and material for your project.</p></div>
      </div>
      <div class="quote-prototype-grid quote-grid-two">
        <label>Machine
          <select name="machine_id" required>
            <?php foreach ($machines as $m): ?>
              <option value="<?= e((string)$m['id']) ?>"><?= e((string)$m['name']) ?></option>
            <?php endforeach; ?>
          </select>
        </label>
        <label>Material
          <select name="material_id" required>
            <?php foreach ($materials as $m): ?>
              <option value="<?= e((string)$m['id']) ?>"><?= e((string)$m['name']) ?></option>
            <?php endforeach; ?>
          </select>
        </label>
      </div>
      <div class="quote-step-heading">
        <span aria-hidden="true">03</span>
        <div><h3>Set your dimensions</h3><p>Enter the actual size of one cut part and the quantity you need. The document size may include empty space.</p></div>
      </div>
      <div class="quote-prototype-grid">
        <label>Part width (mm)
          <input type="number" name="part_width_mm" min="1" step="0.1" placeholder="Enter width" required />
        </label>
        <label>Part height (mm)
          <input type="number" name="part_height_mm" min="1" step="0.1" placeholder="Enter height" required />
        </label>
        <label>Quantity
          <input type="number" name="quantity" min="1" step="1" value="1" required />
        </label>
      </div>
      <label>Notes (optional)
        <textarea name="note" rows="3" placeholder="Any details about this job"></textarea>
      </label>
      <div class="quote-form-footer">
        <p>Your estimate is based on the details and file provided.</p>
        <button type="submit" class="btn">Calculate Quote <span aria-hidden="true">→</span></button>
      </div>
    </form>

    <?php if (is_array($result) && is_array($result['estimate'] ?? null)): ?>
      <?php $est = $result['estimate']; $token = (string)($result['token'] ?? ''); ?>
      <article class="quote-card quote-result-card">
        <p class="quote-card-kicker">Your estimate</p>
        <h2>Quote Result</h2>
        <p>File: <strong><?= e((string)($result['original_file'] ?? '')) ?></strong> · Part size: <?= e((string)($result['input']['part_width_mm'] ?? '')) ?> × <?= e((string)($result['input']['part_height_mm'] ?? '')) ?> mm</p>
        <?php if (!empty($result['warnings']) && is_array($result['warnings'])): ?>
          <p class="alert alert-error"><?= e((string)implode(' ', $result['warnings'])) ?></p>
        <?php endif; ?>
        <div class="quote-stats">
          <div><strong><?= e((string)$est['vector_length_mm']) ?> mm</strong><span>Total cutting length</span></div>
          <div><strong><?= e((string)$est['speed_mm_min']) ?> mm/min</strong><span>Cut speed used</span></div>
          <div><strong><?= e((string)$est['total_minutes']) ?> min</strong><span>Total process time</span></div>
          <div><strong><?= e((string)$est['sheets_needed']) ?></strong><span>Sheets required</span></div>
        </div>
        <div class="quote-breakdown">
          <p>Setup cost: <strong><?= e($currency) ?><?= e(number_format((float)$est['setup_cost'], 2)) ?></strong></p>
          <p>Cutting time cost: <strong><?= e($currency) ?><?= e(number_format((float)$est['cut_cost'], 2)) ?></strong></p>
          <p>Material cost: <strong><?= e($currency) ?><?= e(number_format((float)$est['material_cost'], 2)) ?></strong></p>
          <p>VAT: <strong><?= e($currency) ?><?= e(number_format((float)$est['vat_cost'], 2)) ?></strong></p>
          <p class="quote-total">Estimated total: <strong><?= e($currency) ?><?= e(number_format((float)$est['total_cost'], 2)) ?></strong></p>
        </div>
      </article>

      <article class="quote-card quote-booking-card">
        <p class="quote-card-kicker">Ready to proceed?</p>
        <h2>Book This Order</h2>
        <form class="quote-form" action="/online-quote/book" method="post" novalidate>
          <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
          <input type="hidden" name="quote_token" value="<?= e($token) ?>" />
          <label>Full name
            <input type="text" name="customer_name" required />
          </label>
          <label>Email
            <input type="email" name="email" required />
          </label>
          <label>Phone
            <input type="text" name="phone" required />
          </label>
          <label>Message
            <textarea name="message" rows="3" placeholder="Anything you want us to know"></textarea>
          </label>
          <button type="submit" class="btn">Book Order</button>
        </form>
      </article>
    <?php endif; ?>
  </div>
</section>
<?php endif; ?>
