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
      <p class="lead">Upload your DXF drawing and tell us what you need. We will help you prepare your project for cutting.</p>
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
          <p>Hi! Let's start with your drawing. We'll guide you through the details.</p>
        </div>
      </div>
      <div class="quote-step-heading">
        <span aria-hidden="true">01</span>
        <div><h3>Upload your design</h3><p>Choose your DXF drawing to see a preview and measurements.</p></div>
      </div>
      <div class="quote-upload">
        <details class="quote-file-guide">
          <summary>What is a DXF file? How do I create one?</summary>
          <p>DXF is a drawing file that describes lines and curves for cutting machines. It is not the same as a photo or screenshot.</p>
          <label for="quote-drawing-software">What did you use to draw your design?
            <select id="quote-drawing-software">
              <option value="">Choose an option</option>
              <option value="cad">A CAD program (such as AutoCAD or Fusion)</option>
              <option value="vector">A vector design program (such as Illustrator, CorelDRAW or Inkscape)</option>
              <option value="other">Something else / I'm not sure</option>
            </select>
          </label>
          <p class="quote-software-help" aria-live="polite">Choose an option for a starting point, or contact us and we will help.</p>
          <p>Draw at the intended size, use millimetres, and remove unwanted or duplicate lines. Close outlines where appropriate. Ask us to check your file if you are unsure.</p>
        </details>
        <label>DXF drawing
          <input type="file" name="vector_file" accept=".dxf" aria-describedby="quote-file-help" required />
        </label>
        <p id="quote-file-help">Upload a DXF file up to 50 MB. Need help creating one? Open the guide above or <a href="/contact">contact us</a>.</p>
        <div class="quote-file-preview" hidden aria-live="polite">
          <div class="quote-preview-image" hidden>
            <div class="quote-preview-render" hidden aria-label="Drawing preview"></div>
            <button type="button" class="quote-preview-expand">View fullscreen</button>
            <div class="quote-preview-measurements" hidden>
              <p class="quote-preview-width"></p>
              <p class="quote-preview-height"></p>
              <p class="quote-preview-length"></p>
            </div>
          </div>
          <div class="quote-preview-details">
            <strong class="quote-preview-name"></strong>
            <p class="quote-preview-size"></p>
            <p class="quote-preview-dimensions"></p>
            <p class="quote-preview-message"></p>
          </div>
          <dialog class="quote-preview-dialog" aria-label="Fullscreen drawing preview">
            <div class="quote-preview-dialog-header">
              <strong>Drawing preview</strong>
              <button type="button" class="quote-preview-close">Close fullscreen</button>
            </div>
            <div class="quote-preview-dialog-content"></div>
          </dialog>
        </div>
      </div>
      <div class="quote-step-heading">
        <span aria-hidden="true">02</span>
        <div><h3>Tell us about your material</h3><p>Choose a material. If you are not sure which one to use, <a href="/contact">ask us for advice</a>.</p></div>
      </div>
      <div class="quote-prototype-grid quote-grid-two">
        <label>Material
          <select name="material_id" required>
            <option value="">Choose a material</option>
            <?php foreach ($materials as $m): ?>
              <option value="<?= e((string)$m['id']) ?>"><?= e((string)$m['name']) ?></option>
            <?php endforeach; ?>
          </select>
        </label>
        <label>Machine (testing only)
          <select name="machine_id" required>
            <option value="">Choose a machine</option>
            <?php foreach ($machines as $m): ?>
              <option value="<?= e((string)$m['id']) ?>"><?= e((string)$m['name']) ?></option>
            <?php endforeach; ?>
          </select>
        </label>
      </div>
      <p>Automatic machine selection is not ready yet. Please <a href="/contact">ask us</a> if you are unsure; we will check the material, drawing and machine capacity.</p>
      <div class="quote-step-heading">
        <span aria-hidden="true">03</span>
        <div><h3>Tell us about your parts</h3><p>Enter the actual size of one cut part and the quantity you need. The preview shows the entire drawing, which may contain several parts.</p></div>
      </div>
      <label>What does your drawing contain?
        <select name="drawing_contents" class="quote-drawing-contents" required>
          <option value="">Choose an option</option>
          <option value="single">One part, including any holes or internal cuts</option>
          <option value="multiple">Multiple separate parts</option>
          <option value="unsure">I'm not sure</option>
        </select>
      </label>
      <p class="quote-parts-help" aria-live="polite">If you have multiple parts or are unsure, we can review the file and help work out sheet requirements.</p>
      <p><a href="/contact">Contact us for help with your drawing or sheet requirements</a>.</p>
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
        <p>Testing estimates assume one part per drawing. Sheet quantities are approximate and must be checked before cutting.</p>
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
          <div><strong><?= e((string)$est['vector_length_mm']) ?> mm</strong><span>Cutting length per copy</span></div>
          <div><strong><?= e((string)$est['speed_mm_min']) ?> mm/min</strong><span>Cut speed used</span></div>
          <div><strong><?= e((string)$est['total_minutes']) ?> min</strong><span>Total process time</span></div>
          <div><strong><?= e((string)$est['sheets_needed']) ?></strong><span>Estimated sheets (subject to review)</span></div>
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
