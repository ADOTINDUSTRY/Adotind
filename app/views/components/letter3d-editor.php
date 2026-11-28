<?php
// Only included inside the PIN-protected quote workspace.
require_once __DIR__ . '/../../lib/letter3d_quote.php';
$letterProducts = [];
try {
    $letterDb = quote_db($siteConfig);
    letter3d_schema($letterDb);
    $letterProducts = $letterDb->query('SELECT id,name,description,min_width_mm,max_width_mm,min_height_mm,max_height_mm,max_characters,max_quantity FROM quote_letter3d_products WHERE enabled=1 AND reviewed=1 ORDER BY name,id')->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) { error_log('3D lettering options unavailable: ' . get_class($e)); }
?>
<section class="quote-card letter3d-editor" data-project-panel="letters3d" data-letter3d data-csrf="<?= e(csrf_token()) ?>" hidden>
  <div><h2>Design 3D lettering</h2><p>Choose a shop-configured option, add your text and dimensions, and see a preliminary estimate. The preview illustrates the lettering style; the team checks the artwork, construction, colour and installation before production.</p></div>
  <div class="letter3d-layout">
    <div class="letter3d-controls">
      <label>Lettering option <select data-letter-product required><option value="">Choose an option</option><?php foreach ($letterProducts as $p): ?><option value="<?= (int)$p['id'] ?>" data-min-width="<?= e((string)$p['min_width_mm']) ?>" data-max-width="<?= e((string)$p['max_width_mm']) ?>" data-min-height="<?= e((string)$p['min_height_mm']) ?>" data-max-height="<?= e((string)$p['max_height_mm']) ?>" data-max-chars="<?= (int)$p['max_characters'] ?>" data-max-quantity="<?= (int)$p['max_quantity'] ?>"><?= e($p['name']) ?><?= $p['description'] !== '' ? ' — ' . e($p['description']) : '' ?></option><?php endforeach ?></select></label>
      <?php if (!$letterProducts): ?><p class="letter3d-note">No lettering options have been configured for pricing yet. You can still contact the team to discuss your project.</p><?php endif ?>
      <label>Your text <input type="text" data-letter-text maxlength="200" value="Your sign" autocomplete="off" data-private></label>
      <label>Style <select data-letter-font><option value="sans">Sans serif</option><option value="serif">Serif</option><option value="script">Script</option></select></label>
      <label>Colour <input type="color" data-letter-colour value="#e6e9ed"></label>
      <div class="quote-prototype-grid quote-grid-two"><label>Overall width (mm) <input type="number" data-letter-width min="1" step="0.1" placeholder="e.g. 1000"></label><label>Overall height (mm) <input type="number" data-letter-height min="1" step="0.1" placeholder="e.g. 300"></label></div>
      <label>Number of identical signs <input type="number" data-letter-quantity min="1" step="1" value="1"></label>
      <p class="letter3d-limits" data-letter-limits></p>
    </div>
    <div class="letter3d-stage"><div class="letter3d-preview" aria-label="Illustrative lettering preview"><span data-letter-preview>Your sign</span></div><p>Illustrative preview — artwork and final appearance will be checked with you.</p><div class="letter3d-price" aria-live="polite"><small>Preliminary estimate</small><strong data-letter-price>Choose an option and size</strong><span data-letter-tax></span></div></div>
  </div>
  <div class="letter3d-request"><h3>Send this design for review</h3><p>Sending a request does not place a paid order. We will review the design and confirm the final quotation.</p><div class="quote-prototype-grid quote-grid-two"><label>Your name <input data-letter-name maxlength="200" autocomplete="name" data-private></label><label>Email <input data-letter-email type="email" maxlength="254" autocomplete="email" data-private></label><label>Phone <input data-letter-phone type="tel" maxlength="60" autocomplete="tel" data-private></label></div><button type="button" class="btn" data-letter-send disabled>Send request</button><p data-letter-status role="status" aria-live="polite"></p></div>
</section>
<style>
.letter3d-layout{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(260px,1.2fr);gap:20px}.letter3d-controls label,.letter3d-request label{display:grid;gap:5px;margin:0 0 12px}.letter3d-stage{min-width:0}.letter3d-preview{display:flex;align-items:center;justify-content:center;min-height:240px;padding:25px;overflow:hidden;background:linear-gradient(150deg,#1d2530,#0a111c);border-radius:14px}.letter3d-preview span{display:inline-block;flex-shrink:0;white-space:nowrap;text-align:center;font-size:clamp(26px,5vw,64px);line-height:1.2;text-shadow:1px 1px #8b9099,2px 2px #6a7079,3px 3px #484e57,4px 4px 7px #0009}.letter3d-price{display:grid;gap:4px;background:#ecf4ff;color:#152b50;padding:16px;border-radius:12px}.letter3d-price strong{font-size:1.4rem}.letter3d-request{margin-top:24px}.letter3d-limits,.letter3d-note{font-size:.9rem}.letter3d-stage>p{font-size:.85rem}.letter3d-request [data-letter-status]{min-height:1.5em}@media(max-width:700px){.letter3d-layout{grid-template-columns:1fr}.letter3d-preview{min-height:180px}}
</style>
<script defer src="/public/assets/js/letter3d-editor.js?v=<?= e((string)filemtime(__DIR__ . '/../../../public/assets/js/letter3d-editor.js')) ?>"></script>
