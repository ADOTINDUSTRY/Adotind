<?php
$pinError = flash_get('online_quote_pin_error');
$pinSuccess = flash_get('online_quote_pin_success');
$updatesError = flash_get('online_quote_updates_error');
$updatesSuccess = flash_get('online_quote_updates_success');
$quoteError = flash_get('online_quote_error');
$quoteErrorReason = flash_get('online_quote_error_reason', '');
$quoteSuccess = flash_get('online_quote_success');
$reviewNotice = flash_get('quote_review_notice');
$bookingDetails = flash_get('quote_booking_details', []);
$unlocked = !empty($page['quote_unlocked']);
$quoteData = $page['quote_data'] ?? ['machines' => [], 'materials' => [], 'rates' => [], 'settings' => []];
$machines = is_array($quoteData['machines'] ?? null) ? $quoteData['machines'] : [];
$materials = is_array($quoteData['materials'] ?? null) ? $quoteData['materials'] : [];
$settings = is_array($quoteData['settings'] ?? null) ? $quoteData['settings'] : [];
$result = is_array($page['quote_result'] ?? null) ? $page['quote_result'] : null;
$currency = (string)($settings['currency_symbol'] ?? '€');
$waBase = (string)($siteConfig['whatsapp'] ?? '');
$viberBase = (string)($siteConfig['viber'] ?? '');
require_once __DIR__ . '/../../lib/public_project_picker.php';
$knownProjects = require __DIR__ . '/../../data/quote-projects.php';
?>
<?php if ($quoteError || $quoteSuccess): ?>
<div hidden data-tracking-outcome="<?= $quoteError ? 'quote_error' : (str_starts_with($quoteSuccess, 'Order request') ? 'order_requested' : 'price_shown') ?>" data-tracking-reason="<?= e((string)$quoteErrorReason) ?>"></div>
<?php endif; ?>
<?php if ($updatesError || $updatesSuccess): ?>
<div hidden data-tracking-outcome="<?= $updatesError ? 'quote_updates_error' : 'quote_updates_requested' ?>"></div>
<?php endif; ?>
<section class="page-hero quote-hero">
  <div class="container quote-hero-inner">
    <div>
      <p class="eyebrow">Online Quote</p>
      <h1>Make your next idea a reality.</h1>
      <?php if (!$unlocked): ?><p class="lead">Upload your DXF drawing and tell us what you need. We will help you prepare your project for cutting.</p><?php endif; ?>
    </div>
    <?php if (!$unlocked): ?><div class="quote-processes" aria-label="Available processes">
      <span>CO2 Laser</span><span>Fiber Laser</span><span>CNC Router</span>
    </div><?php endif; ?>
  </div>
</section>

<?php if (!$unlocked): ?>
<section class="section section-light quote-page">
  <div class="container two-col quote-gate-grid">
    <div class="quote-card quote-lock-card" data-tracking-section="quote-access">
      <p class="quote-card-kicker">For testers</p>
      <h2>Private Testing Access</h2>
      <p>This page is temporarily PIN-protected while we finalize production settings.</p>
      <?php if (is_string($pinSuccess)): ?><p class="quote-access-notice" role="status"><?= e($pinSuccess) ?></p><?php endif; ?>
      <?php if (is_string($pinError)): ?><p class="alert alert-error"><?= e($pinError) ?></p><?php endif; ?>
      <form action="/online-quote/pin" method="post" class="quote-form quote-pin-form" novalidate>
        <?php if (is_string($_GET['project'] ?? null) && isset($knownProjects[$_GET['project']])): ?><input type="hidden" name="project" value="<?= e($_GET['project']) ?>"><?php endif; ?>
        <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
        <label>Enter PIN
          <input type="password" name="pin" inputmode="numeric" maxlength="12" placeholder="PIN" required data-private />
        </label>
        <button type="submit" class="btn" data-tracking-control="open-quote">Open Quote System</button>
      </form>
    </div>

    <div class="quote-card" data-tracking-section="quote-updates">
      <p class="quote-card-kicker">Something new is on its way</p>
      <h2>Coming Soon — Under Development</h2>
      <p>Public launch is in progress. Leave your email and we will notify you when this system goes live.</p>
      <?php if (is_string($updatesSuccess)): ?><p class="alert alert-success"><?= e($updatesSuccess) ?></p><?php endif; ?>
      <?php if (is_string($updatesError)): ?><p class="alert alert-error"><?= e($updatesError) ?></p><?php endif; ?>
      <form action="/online-quote/updates" method="post" class="quote-form quote-updates-form" novalidate>
        <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
        <label>Email for updates
          <input type="email" name="email" placeholder="you@example.com" required data-tracking-control="email-updates" />
        </label>
        <button type="submit" class="btn btn-outline" data-tracking-control="notify-me">Notify Me</button>
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
  <div class="container quote-workspace" data-tracking-section="quote-workspace">
    <?php if (is_string($pinSuccess)): ?><p class="quote-access-notice" role="status"><?= e($pinSuccess) ?></p><?php endif; ?>
    <?php if (is_string($quoteSuccess)): ?><p class="alert alert-success"><?= e($quoteSuccess) ?></p><?php endif; ?>
    <?php if (is_string($quoteError)): ?><p class="alert alert-error"><?= e($quoteError) ?></p><?php endif; ?>

    <section class="quote-card quote-start" hidden>
      <h2 tabindex="-1">What would you like to make?</h2>
      <p class="project-intro">Choose a starting point and we’ll guide you through the next steps.</p>
      <div class="quote-form project-picker">
        <label for="project-search">Find a project</label>
        <div class="project-search-box">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
          <input id="project-search" type="search" placeholder="Search projects" autocomplete="off" aria-describedby="project-count" />
          <button type="button" id="project-clear" class="project-clear" aria-label="Clear project search" hidden>Clear</button>
        </div>
        <div class="project-list-heading"><h3>Explore projects</h3><p id="project-count" aria-live="polite"></p></div>
        <div class="project-options" aria-label="Available projects">
          <?php
          $projectCatalog = quote_project_catalog();
          // Local icon paths and labels describe the starting point, not a promise of an automatic price.
          $projectTypes = [
            'neon' => ['Sign designer', 'M12 2l1.4 4.2L18 8l-4.6 1.8L12 14l-1.4-4.2L6 8l4.6-1.8L12 2z M5 15l.9 2.1L8 18l-2.1.9L5 21l-.9-2.1L2 18l2.1-.9L5 15z'],
            'drawing' => ['DXF cutting', 'M4 4h16v16H4z M8 4v16 M4 9h16 M12 13l2 2 3-4'],
            'picture' => ['Image preview', 'M4 4h16v16H4z M4 16l5-5 4 4 2-2 5 5 M16 8h.01'],
            'letters3d' => ['Letter designer', 'M4 19 9 5h3l5 14 M6.2 14h8.6 M18 7l2 1v11l-2 1'],
            'printing' => ['Print designer', 'M6 9V4h12v5 M6 17H4V9h16v8h-2 M6 14h12v6H6z M17 11h.01'],
            'frames' => ['Frame designer', 'M3 5h18v14H3z M7 9h10v6H7z'],
            'inquiry' => ['Team review', 'M4 5h16v11H9l-5 4V5z M8 10h8'],
          ];
          foreach ($projectCatalog as $id => $project): ?>
          <?php [$projectType, $projectIcon] = $projectTypes[$project['workflow']] ?? ['Explore project', 'M4 4h16v16H4z']; ?>
          <button type="button" data-quote-path="<?= e($id) ?>" data-quote-workflow="<?= e($project['workflow']) ?>" data-keywords="<?= e($project['keywords']) ?>">
            <svg class="project-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="<?= e($projectIcon) ?>"/></svg>
            <div class="project-card-content"><strong><?= e($project['name']) ?></strong><span><?= e($project['description']) ?></span><small><?= e($projectType) ?></small></div>
          </button>
          <?php endforeach; ?>
        </div>
        <p id="project-empty" role="status" <?= $projectCatalog ? 'hidden' : '' ?>>No matching projects. Try another word or use the project guide below.</p>
        <button type="button" class="project-help" data-quote-path="guide"><strong>Not sure where to start?</strong><span>Help me choose a project</span></button>
      </div>
    </section>
    <button type="button" class="quote-back" hidden>&larr; Back</button>
    <section class="quote-card quote-form" data-project-panel="guide" hidden>
      <h2>What do you have in mind?</h2>
      <label>Choose the closest description
        <select id="guide-answer">
          <option value="">Choose an option</option>
          <?php $guidePrompts = ['neon'=>'I want a name or message that lights up', 'drawing'=>'I have a technical drawing and need pieces cut', 'picture'=>'I have a picture and want to cut its shape']; ?>
          <?php foreach ($projectCatalog as $id => $project): ?><option value="<?= e($id) ?>"><?= e($guidePrompts[$id] ?? $project['name']) ?></option><?php endforeach; ?>
          <option value="unsure">Something else, or I’m not sure</option>
        </select>
      </label>
      <div id="guide-response" aria-live="polite"></div>
      <button type="button" id="guide-open" class="btn" hidden>Open project</button>
    </section>
    <section class="quote-card quote-form" data-project-panel="inquiry" hidden>
      <h2>Tell us about your project</h2>
      <p>Our team will review your details and contact you with the next step. This service does not offer an instant price yet.</p>
      <script type="application/json" id="project-inquiry-questions"><?= json_encode(require __DIR__ . '/../../data/quote-inquiry-questions.php', JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) ?></script>
      <form class="quote-form" method="post" action="/contact/submit" enctype="multipart/form-data">
        <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
        <input type="hidden" name="service_required" data-project-inquiry-service />
        <p>Selected project: <strong data-project-inquiry-name></strong></p>
        <div class="quote-prototype-grid quote-grid-two">
          <label>Your name <input name="customer_name" required maxlength="200" data-private /></label>
          <label>Email <input type="email" name="email" required maxlength="254" data-private /></label>
          <label>Phone <input type="tel" name="phone" required maxlength="60" data-private /></label>
          <label>Company (optional) <input name="company_name" maxlength="200" data-private /></label>
        </div>
        <label>What would you like to make? <textarea name="project_description" rows="4" required maxlength="5000" data-private></textarea></label>
        <fieldset class="quote-inquiry-questions">
          <legend>More details <small>(optional)</small></legend>
          <p>Share anything you already know. Our team can help with the rest.</p>
          <div class="quote-prototype-grid quote-grid-two">
            <label data-inquiry-field="dimensions" hidden><span data-inquiry-label>Dimensions</span><input name="dimensions" maxlength="200" data-private disabled /></label>
            <label data-inquiry-field="material" hidden><span data-inquiry-label>Material</span><input name="material" maxlength="200" data-private disabled /></label>
            <label data-inquiry-field="quantity" hidden><span data-inquiry-label>Quantity</span><input name="quantity" maxlength="100" data-private disabled /></label>
            <label data-inquiry-field="installation" hidden><span data-inquiry-label>Location or mounting</span><input name="installation" maxlength="200" data-private disabled /></label>
            <label data-inquiry-field="finish" hidden><span data-inquiry-label>Finish</span><input name="finish" maxlength="200" data-private disabled /></label>
          </div>
        </fieldset>
        <label>Drawing or photo (optional; up to 10 MB) <input type="file" name="project_file" accept=".pdf,.jpg,.jpeg,.png,.webp,.svg,.dxf,.dwg,.zip" data-private /></label>
        <button type="submit" class="btn">Send project inquiry</button>
      </form>
    </section>
    <?php require __DIR__ . '/../components/neon-editor.php'; ?>
    <?php require __DIR__ . '/../components/print-editor.php'; ?>
    <?php require __DIR__ . '/../components/frame-editor.php'; ?>
    <?php require __DIR__ . '/../components/letter3d-editor.php'; ?>
    <script type="application/json" id="cutting-project-pairs"><?= json_encode((object)($quoteData['project_pairs'] ?? []), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
    <details class="quote-card quote-artwork" data-tracking-section="artwork-preview">
      <summary>Starting with a photo or logo?</summary>
      <div class="quote-form">
        <h2>Preview a cut line</h2>
        <p>Choose a front-facing, single-colour design with a plain or transparent background. Check the red outline, including any holes. This is a visual proof only.</p>
        <label>Photo or logo (PNG or JPG, up to 10 MB)
          <input type="file" id="artwork-file" accept="image/png,image/jpeg" data-private />
        </label>
        <p id="artwork-status" role="status"></p>
        <div id="artwork-controls" hidden>
          <canvas id="artwork-proof" aria-label="Your artwork with suggested cut lines in red"></canvas>
          <label>Trace <select id="artwork-tone"><option value="dark">Dark artwork</option><option value="light">Light artwork</option></select></label>
          <label>Light/dark cutoff <input type="range" id="artwork-cutoff" min="1" max="254" value="160" /></label>
          <label>Finished width (mm) <input type="number" id="artwork-width" min="0.1" step="0.1" placeholder="Enter width" /></label>
          <output id="artwork-size" aria-live="polite"></output>
        </div>
      </div>
    </details>
    <form class="quote-form quote-prototype" method="post" action="/online-quote/calculate" enctype="multipart/form-data" novalidate>
      <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
      <input type="hidden" name="cutting_project" value="drawing" />
      <div class="quote-stage" data-stage="drawing">
        <div class="quote-step-heading" data-tracking-section="drawing-upload">
          <span aria-hidden="true">01</span>
          <div><h3>Upload your design</h3><p data-cutting-project-name></p><p>Choose your DXF drawing to see a preview and measurements.</p></div>
        </div>
        <div class="quote-upload" data-tracking-section="drawing-upload">
          <details class="quote-file-guide">
            <summary data-tracking-control="dxf-guide">What is a DXF file? How do I create one?</summary>
            <p>DXF is a drawing file that describes lines and curves for cutting machines. It is not the same as a photo or screenshot.</p>
            <label for="quote-drawing-software">What did you use to draw your design?
              <select id="quote-drawing-software" data-tracking-control="drawing-software">
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
            <input type="file" name="vector_file" accept=".dxf" aria-describedby="quote-file-help" required data-tracking-control="dxf-upload" />
          </label>
          <p id="quote-file-help">Upload one part as a DXF, up to 50 MB. Export it with explicit drawing units, preferably millimetres. For text, blocks or splines, export the cutting outlines or <a href="/contact">ask us to review the drawing</a>.</p>
          <p data-cutting-measure-status role="status" aria-live="polite"></p>
          <div class="quote-file-preview" hidden aria-live="polite" data-tracking-section="drawing-preview">
            <div class="quote-preview-image" hidden>
              <div class="quote-preview-render" hidden aria-label="Drawing preview"></div>
              <button type="button" class="quote-preview-expand" data-tracking-control="expand-preview">View fullscreen</button>
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
                <button type="button" class="quote-preview-close" data-tracking-control="close-preview">Close fullscreen</button>
              </div>
              <div class="quote-preview-dialog-content"></div>
            </dialog>
          </div>
        </div>
        <label data-tracking-section="part-details">What does your drawing contain?
          <select name="drawing_contents" class="quote-drawing-contents" required data-tracking-control="drawing-contents">
            <option value="">Choose an option</option>
            <option value="single">One part, including any holes or internal cuts</option>
            <option value="multiple">Multiple separate parts</option>
            <option value="unsure">I'm not sure</option>
          </select>
        </label>
        <p class="quote-parts-help" aria-live="polite" data-tracking-section="part-details">If you have multiple parts or are unsure, we can review the file and help work out sheet requirements.</p>
        <p data-tracking-section="part-details"><a href="/contact">Contact us for help with your drawing or sheet requirements</a>.</p>
        <button type="button" class="btn quote-next" data-next="material" hidden>Continue to material</button>
      </div>
      <div class="quote-stage" data-stage="material">
        <div class="quote-step-heading" data-tracking-section="material-and-machine">
          <span aria-hidden="true">02</span>
          <div><h3>Tell us about your material</h3><p>Choose a material. If you are not sure which one to use, <a href="/contact">ask us for advice</a>.</p></div>
        </div>
        <div class="quote-prototype-grid quote-grid-two" data-tracking-section="material-and-machine">
          <label>Material
            <select name="material_id" required data-tracking-control="quote-material">
              <option value="">Choose a material</option>
              <?php foreach ($materials as $m): ?>
                <option value="<?= e((string)$m['id']) ?>"><?= e((string)$m['name']) ?></option>
              <?php endforeach; ?>
            </select>
          </label>
          <label data-cutting-machine-label>Cutting process
            <select name="machine_id" required data-tracking-control="quote-machine">
              <option value="">Choose a machine</option>
              <?php foreach ($machines as $m): ?>
                <option value="<?= e((string)$m['id']) ?>"><?= e((string)$m['name']) ?></option>
              <?php endforeach; ?>
            </select>
          </label>
        </div>
        <p data-cutting-options-status role="status" aria-live="polite"></p>
        <p data-tracking-section="material-and-machine">Only machine and material combinations reviewed by our shop appear here. Need help or another material? <a href="/contact">Contact us</a>.</p>
        <button type="button" class="btn quote-next" data-next="parts" hidden>Continue to size and quantity</button>
      </div>
      <div class="quote-stage" data-stage="parts">
        <div class="quote-step-heading" data-tracking-section="part-details">
          <span aria-hidden="true">03</span>
          <div><h3>Tell us about your parts</h3><p>Enter the actual size of one cut part and the quantity you need. The preview shows the entire drawing, which may contain several parts.</p></div>
        </div>
        <div class="quote-prototype-grid" data-tracking-section="part-details">
          <label>Part width (mm)
            <input type="number" name="part_width_mm" min="1" step="0.1" placeholder="Enter width" required data-tracking-control="part-width" />
          </label>
          <label>Part height (mm)
            <input type="number" name="part_height_mm" min="1" step="0.1" placeholder="Enter height" required data-tracking-control="part-height" />
          </label>
          <label>Quantity
            <input type="number" name="quantity" min="1" step="1" value="1" required data-tracking-control="part-quantity" />
          </label>
        </div>
        <label data-tracking-section="part-details">Notes (optional)
          <textarea name="note" rows="3" placeholder="Any details about this job" data-tracking-control="part-notes"></textarea>
        </label>
        <div class="quote-form-footer" data-tracking-section="calculate-quote">
          <p>Testing estimates assume one part per drawing. Sheet quantities are approximate and must be checked before cutting.</p>
          <button type="submit" class="btn" data-tracking-control="calculate-quote">Calculate Quote <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </form>

    <?php if (is_array($result) && is_array($result['estimate'] ?? null)): ?>
      <?php $est = $result['estimate']; $currency = (string)($est['currency'] ?? $currency); $token = (string)($result['token'] ?? ''); ?>
      <article id="current-estimate" class="quote-card quote-result-card" data-tracking-section="quote-result">
        <p class="quote-card-kicker">Your estimate</p>
        <h2>Preliminary estimate: <?= e($currency . number_format((float)$est['total_cost'], 2)) ?></h2>
        <p>The final price, drawing dimensions, material suitability and production require review by our team.</p>
        <?php if (isset($result['previous_price'])): ?>
          <p class="quote-access-notice" role="status">The price changed from <?= e($result['previous_price']) ?> to <?= e($currency . number_format((float)$est['total_cost'], 2)) ?>. Review this amount before sending your order request.</p>
        <?php elseif ($reviewNotice): ?><p role="status"><?= e($reviewNotice) ?></p><?php endif; ?>
        <p>File: <strong><?= e((string)($result['original_file'] ?? '')) ?></strong> · Part size: <?= e(number_format((float)($result['input']['part_width_mm'] ?? 0), 1)) ?> × <?= e(number_format((float)($result['input']['part_height_mm'] ?? 0), 1)) ?> mm</p>
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

      <article class="quote-card quote-booking-card" data-tracking-section="order-booking">
        <p class="quote-card-kicker">Ready to proceed?</p>
        <h2>Book This Order</h2>
        <form class="quote-form" action="/online-quote/book" method="post" novalidate>
          <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />
          <input type="hidden" name="quote_token" value="<?= e($token) ?>" />
          <label>Full name
            <input type="text" name="customer_name" value="<?= e($bookingDetails['name'] ?? '') ?>" required data-tracking-control="order-name" />
          </label>
          <label>Email
            <input type="email" name="email" value="<?= e($bookingDetails['email'] ?? '') ?>" required data-tracking-control="order-email" />
          </label>
          <label>Phone
            <input type="text" name="phone" value="<?= e($bookingDetails['phone'] ?? '') ?>" required data-tracking-control="order-phone" />
          </label>
          <label>Message
            <textarea name="message" rows="3" placeholder="Anything you want us to know" data-tracking-control="order-message"><?= e($bookingDetails['message'] ?? '') ?></textarea>
          </label>
          <button type="submit" class="btn" data-tracking-control="book-order">Send order request · <?= e($currency . number_format((float)$est['total_cost'], 2)) ?></button>
        </form>
      </article>
    <?php endif; ?>
  </div>
</section>
<?php endif; ?>
