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
<section class="letter3d-editor" data-project-panel="letters3d" data-letter3d data-csrf="<?= e(csrf_token()) ?>" aria-labelledby="letter3d-title" hidden>
  <header class="letter3d-heading"><div><h2 id="letter3d-title">3D letter designer</h2><p>Create your lettering and see a preliminary estimate.</p></div><button type="button" data-letter-reset>Start over</button></header>
  <div class="letter3d-layout">
    <div class="letter3d-stage">
      <div class="letter3d-view" data-letter-stage data-scene="studio">
        <div class="letter3d-stage-bar">
          <div class="letter3d-scenes" role="group" aria-label="Preview background">
            <button type="button" data-letter-scene="studio" aria-pressed="true">Studio</button>
            <button type="button" data-letter-scene="brick" aria-pressed="false">Brick</button>
            <button type="button" data-letter-scene="concrete" aria-pressed="false">Concrete</button>
          </div>
          <div class="letter3d-price" aria-live="polite"><small>Estimated price</small><strong data-letter-price>Choose an option and size</strong><span data-letter-tax></span></div>
        </div>
        <div class="letter3d-preview" aria-label="Illustrative lettering preview"><span data-letter-preview>Your sign</span></div>
        <div class="letter3d-stage-footer"><div class="letter3d-zoom" role="group" aria-label="Preview zoom">
          <button type="button" data-letter-zoom="out" aria-label="Zoom out">−</button>
          <output data-letter-zoom-level aria-label="Zoom level">100%</output>
          <button type="button" data-letter-zoom="in" aria-label="Zoom in">+</button>
          <button type="button" data-letter-zoom="fit">Fit</button>
        </div><span>Illustrative preview</span></div>
      </div>
      <p class="letter3d-disclaimer">The preview illustrates your lettering. We check the artwork, construction, colour and installation before production.</p>
    </div>
    <div class="letter3d-controls">
      <details class="letter3d-group" open><summary>Your lettering</summary><div class="letter3d-group-body">
        <label>Lettering option <select data-letter-product required><option value="">Choose an option</option><?php foreach ($letterProducts as $p): ?><option value="<?= (int)$p['id'] ?>" data-min-width="<?= e((string)$p['min_width_mm']) ?>" data-max-width="<?= e((string)$p['max_width_mm']) ?>" data-min-height="<?= e((string)$p['min_height_mm']) ?>" data-max-height="<?= e((string)$p['max_height_mm']) ?>" data-max-chars="<?= (int)$p['max_characters'] ?>" data-max-quantity="<?= (int)$p['max_quantity'] ?>"><?= e($p['name']) ?><?= $p['description'] !== '' ? ' — ' . e($p['description']) : '' ?></option><?php endforeach ?></select></label>
        <?php if (!$letterProducts): ?><p class="letter3d-note">No lettering options have been configured for pricing yet. You can still contact the team to discuss your project.</p><?php endif ?>
        <label>Your text <textarea data-letter-text maxlength="200" rows="3" data-private>Your sign</textarea></label>
        <label>Letter style <select data-letter-font><option value="sans">Sans serif</option><option value="serif">Serif</option><option value="script">Script</option></select></label>
        <label class="letter3d-colour">Face colour <input type="color" data-letter-colour value="#e6e9ed"></label>
      </div></details>
      <details class="letter3d-group" open><summary>Size &amp; quantity</summary><div class="letter3d-group-body">
        <div class="letter3d-size-grid"><label>Overall width (mm) <input type="number" data-letter-width min="1" step="0.1" placeholder="e.g. 1000"></label><label>Overall height (mm) <input type="number" data-letter-height min="1" step="0.1" placeholder="e.g. 300"></label></div>
        <label>Number of identical signs <input type="number" data-letter-quantity min="1" step="1" value="1"></label>
        <p class="letter3d-limits" data-letter-limits></p>
      </div></details>
      <details class="letter3d-group letter3d-request" open><summary>Send this design for review</summary><div class="letter3d-group-body">
        <p>We will review your design and confirm the final quotation. Sending a request does not take payment.</p>
        <label>Your name <input data-letter-name maxlength="200" autocomplete="name" data-private></label>
        <label>Email <input data-letter-email type="email" maxlength="254" autocomplete="email" data-private></label>
        <label>Phone <input data-letter-phone type="tel" maxlength="60" autocomplete="tel" data-private></label>
        <button type="button" class="btn letter3d-send" data-letter-send disabled>Send request</button><p data-letter-status role="status" aria-live="polite"></p>
      </div></details>
    </div>
  </div>
</section>
<style>
.quote-workspace:has(.letter3d-editor:not([hidden])){max-width:1420px}
body:has(.letter3d-editor:not([hidden])) .quote-hero{display:none}
.letter3d-editor{--l3-ink:#182236;--l3-muted:#536079;--l3-line:#d5dce6;color:var(--l3-ink);font:500 .94rem/1.5 "Inter","Segoe UI",sans-serif;min-width:0}
.letter3d-editor :where(button,input,select,textarea){font:inherit}.letter3d-editor button{cursor:pointer}.letter3d-editor button:disabled{opacity:.5;cursor:default}
.letter3d-editor :is(button,summary,input,select,textarea):focus-visible{outline:3px solid #4275dc;outline-offset:3px}
.letter3d-heading{display:flex;justify-content:space-between;gap:1rem;align-items:start;flex-wrap:wrap;margin:0 0 1rem}.letter3d-heading button{border:1px solid #bcc8d8;border-radius:7px;background:#fff;color:#182236;padding:.5rem .8rem}.letter3d-heading h2{color:var(--l3-ink);font-size:clamp(1.9rem,3vw,3rem);line-height:1.08;letter-spacing:-.045em;margin:0}.letter3d-heading p{color:var(--l3-muted);margin:.3rem 0 0}
.letter3d-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,370px);gap:1rem;align-items:start}.letter3d-stage,.letter3d-controls{min-width:0}.letter3d-view{background:#151b29;color:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px #12203d1a}
.letter3d-stage-bar,.letter3d-stage-footer{display:flex;align-items:center;justify-content:space-between;gap:.7rem;padding:.7rem;flex-wrap:wrap;background:#111827}.letter3d-scenes,.letter3d-zoom{display:flex;align-items:center;gap:.25rem}.letter3d-scenes button,.letter3d-zoom button{border:1px solid #465267;border-radius:7px;background:#273348;color:#f4f7fb;padding:.4rem .7rem}.letter3d-scenes button[aria-pressed="true"]{background:#f4c925;color:#172033;border-color:#f4c925}.letter3d-zoom output{min-width:3rem;text-align:center;font-size:.8rem}.letter3d-stage-footer>span{font-size:.75rem;color:#c5cedd}
.letter3d-price{display:grid;gap:0;background:#f3ca29;color:#172033;padding:.4rem .7rem;border-radius:8px;max-width:100%;line-height:1.3}.letter3d-price small{font-size:.7rem}.letter3d-price strong{font-size:.92rem}.letter3d-price span{font-size:.65rem;max-width:220px}
.letter3d-preview{display:flex;align-items:center;justify-content:center;min-height:clamp(280px,42vw,520px);padding:25px;overflow:hidden;background:linear-gradient(150deg,#303846,#101622)}
.letter3d-view[data-scene="brick"] .letter3d-preview{background-color:#514944;background-image:linear-gradient(0deg,transparent 95%,#292421 96%),linear-gradient(90deg,transparent 96%,#292421 97%);background-size:100% 54px,110px 54px}
.letter3d-view[data-scene="concrete"] .letter3d-preview{background-color:#747775;background-image:radial-gradient(#ffffff18 .8px,transparent 1px),radial-gradient(#00000020 .8px,transparent 1px);background-size:9px 9px,13px 13px;background-position:0 0,4px 3px}
.letter3d-preview span{display:inline-block;flex-shrink:0;white-space:pre;text-align:center;font-size:clamp(32px,6vw,80px);line-height:1.2;text-shadow:1px 1px #8b9099,2px 2px #6a7079,3px 3px #484e57,4px 4px 7px #0009;transform-origin:center}
.letter3d-disclaimer,.letter3d-limits,.letter3d-note{font-size:.82rem;color:var(--l3-muted)}.letter3d-disclaimer{margin:.65rem .2rem}.letter3d-controls{display:grid;gap:.7rem}.letter3d-group{border:1px solid var(--l3-line);background:#fff;border-radius:12px;overflow:hidden}.letter3d-group summary{cursor:pointer;font-weight:750;padding:.8rem 1rem;background:#f7f9fc}.letter3d-group-body{padding:1rem}.letter3d-controls label{display:grid;gap:.3rem;font-weight:650;margin:0 0 .8rem}.letter3d-controls :is(input:not([type="color"]),select,textarea){width:100%;min-width:0;padding:.6rem .65rem;border:1px solid #bcc8d8;border-radius:7px;background:#fff;color:#182236}.letter3d-controls input[type="color"]{width:3rem;height:2.5rem;padding:.15rem;border:1px solid #bcc8d8;border-radius:7px;background:#fff}.letter3d-size-grid{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}.letter3d-request p{font-size:.84rem}.letter3d-request [data-letter-status]{min-height:1.5em}.letter3d-send{width:100%}
@media(max-width:800px){.letter3d-layout{grid-template-columns:1fr}.letter3d-preview{min-height:260px}.letter3d-price{margin-left:auto}.letter3d-heading h2{font-size:2rem}}
@media(max-width:420px){.letter3d-stage-bar{align-items:start}.letter3d-scenes button{padding:.35rem .5rem}.letter3d-price{margin-left:0}.letter3d-size-grid{grid-template-columns:1fr}}
</style>
<script defer src="/public/assets/js/letter3d-editor.js?v=<?= e((string)filemtime(__DIR__ . '/../../../public/assets/js/letter3d-editor.js')) ?>"></script>
