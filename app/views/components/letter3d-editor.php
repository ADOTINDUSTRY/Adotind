<?php
// Only included inside the PIN-protected quote workspace.
require_once __DIR__ . '/../../lib/letter3d_quote.php';
$letterFonts = [];
$letterProducts = [];
$letterConstruction = null;
$letterFilmCatalog = json_decode((string)file_get_contents(__DIR__ . '/../../data/avery500-colours.json'), true);
if (!is_array($letterFilmCatalog) || !is_array($letterFilmCatalog['colours'] ?? null)) $letterFilmCatalog = ['colours'=>[]];
try {
    $letterDb = quote_db($siteConfig);
    letter3d_schema($letterDb);
    $letterFonts = letter3d_enabled_fonts($letterDb);
    $letterConstruction = letter3d_construction_standard($letterDb);
    $letterProducts = $letterDb->query('SELECT id,name,description,min_width_mm,max_width_mm,min_height_mm,max_height_mm,max_characters,max_quantity FROM quote_letter3d_products WHERE enabled=1 AND reviewed=1 ORDER BY name,id')->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) { error_log('3D lettering options unavailable: ' . get_class($e)); }
uasort($letterFonts, static fn(array $a, array $b): int => strcasecmp($a['name'], $b['name']));
$defaultFont = isset($letterFonts['sans']) ? 'sans' : array_key_first($letterFonts);
ob_start();
foreach ($letterFonts as $key => $entry): ?><option value="<?= e($key) ?>"<?= $key === $defaultFont ? ' selected' : '' ?>><?= e($entry['name']) ?></option><?php endforeach; ?>
<option value="serif" hidden>Serif (saved design)</option><option value="script" hidden>Script (saved design)</option>
<?php $letterFontOptions = ob_get_clean();
?>
<section class="letter3d-editor" data-project-panel="letters3d" data-letter3d data-csrf="<?= e(csrf_token()) ?>" data-geometry-src="/public/assets/js/letter3d-manufacturing.js?v=<?= e((string)filemtime(__DIR__ . '/../../../public/assets/js/letter3d-manufacturing.js')) ?>" data-dxf-src="/public/assets/js/letter3d-dxf.js?v=<?= e((string)filemtime(__DIR__ . '/../../../public/assets/js/letter3d-dxf.js')) ?>" data-clipper-src="/public/assets/js/neon-clipper.js?v=<?= e((string)filemtime(__DIR__ . '/../../../public/assets/js/neon-clipper.js')) ?>" data-renderer-src="/public/assets/js/letter3d-renderer.js?v=<?= e((string)filemtime(__DIR__ . '/../../../public/assets/js/letter3d-renderer.js')) ?>" aria-labelledby="letter3d-title" hidden>
  <script type="application/json" data-letter-films><?= json_encode($letterFilmCatalog, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?></script>
  <script type="application/json" data-letter-construction><?= json_encode($letterConstruction, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?></script>
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
          <label class="letter3d-lights"><input type="checkbox" data-letter-lights checked aria-label="Turn preview lights on or off"><span>Lights</span></label>
          <label class="letter3d-lights"><input type="checkbox" data-letter-back checked disabled aria-label="Show PVC letter backs in the preview"><span>PVC back</span></label>
          <div class="letter3d-price" aria-live="polite"><small>Estimated price</small><strong data-letter-price>Choose an option and size</strong><span data-letter-tax></span><span data-letter-price-scope></span></div>
        </div>
        <div class="letter3d-preview" tabindex="0" role="region" aria-label="Illustrative sign preview. In 3D mode, drag or use arrow keys to turn it."><span data-letter-preview>Your sign</span><div class="letter3d-three" data-letter-three aria-hidden="true"></div></div>
        <div class="letter3d-stage-footer"><div class="letter3d-zoom" role="group" aria-label="Preview zoom">
          <button type="button" data-letter-zoom="out" aria-label="Zoom out">−</button>
          <output data-letter-zoom-level aria-label="Zoom level">100%</output>
          <button type="button" data-letter-zoom="in" aria-label="Zoom in">+</button>
          <button type="button" data-letter-zoom="fit">Fit</button>
        </div><span class="letter3d-orbit-hint">Drag or use arrow keys to turn · Fit resets view</span><span data-letter-render-status role="status">Illustrative preview</span></div>
      </div>
      <details class="letter3d-cutting" data-letter-cutting>
        <summary>Face and groove cutting preview</summary>
        <div class="letter3d-cutting-body">
          <p>Blue is the acrylic cut; orange is the groove reference on the back. Cut toward the blue edge: outside outer contours and inside openings.</p>
          <p>This method fixes the reference 2 mm from the face edge and does not use the ERP's separate face-overhang setting. Confirm the aluminium fit before production.</p>
          <svg data-letter-cutting-svg role="img" aria-label="Acrylic cut and groove reference. Drag to move the drawing." hidden></svg>
          <div class="letter3d-cutting-zoom" role="group" aria-label="Cutting preview zoom"><button type="button" data-letter-cutting-zoom="out" aria-label="Zoom cutting preview out">−</button><output data-letter-cutting-zoom-level>100%</output><button type="button" data-letter-cutting-zoom="in" aria-label="Zoom cutting preview in">+</button><button type="button" data-letter-cutting-zoom="fit">Fit</button><small>Drag drawing to move</small></div>
          <p data-letter-cutting-dimensions></p>
          <p data-letter-cutting-status role="status">Enter a finished width or height to prepare the cutting preview.</p>
          <p data-letter-cutting-instructions></p>
          <button type="button" class="btn" data-letter-tech-view aria-pressed="false" disabled>Inspect grooved acrylic in 3D</button>
          <small>The 3D inspection hides the aluminium and PVC so you can turn the acrylic over and see the rear groove. Cyan marks the cutter centre. Check the toolpath in Aspire.</small>
          <label>Cutting file format <select data-letter-export-format><option value="dxf">DXF · AutoCAD R12 (mm)</option><option value="pdf">Vector PDF · face and groove</option><option value="pdf-face">Vector PDF · acrylic face only</option><option value="pdf-groove">Vector PDF · groove reference only</option></select></label>
          <button type="button" class="btn" data-letter-export-dxf disabled>Download cutting vectors</button>
          <small>In Aspire, import DXF in millimetres or PDF at actual size. Use separate face and groove PDFs when your CAM software places all PDF paths on one layer. Set the tool and cutting depth in CAM.</small>
          <a href="/online-quote?project=drawing">Import a DXF or vector PDF in Custom CNC Cutting</a>
        </div>
      </details>
      <p class="letter3d-disclaimer">The 3D view is illustrative; the cutting preview shows the measured face and groove vectors. The shop reviews the design before production.</p>
    </div>
    <div class="letter3d-controls">
      <details class="letter3d-group" open><summary>Backboard</summary><div class="letter3d-group-body">
        <label>Backboard<select data-letter-board-shape><option value="none">No backboard</option><option value="rectangle">Rectangular backboard</option></select></label>
        <div data-letter-board-options hidden>
          <div class="letter3d-board-size">
            <label>Width (mm)<input type="number" data-letter-board-width min="0.001" max="10000" step="any" placeholder="Auto"></label>
            <label>Height (mm)<input type="number" data-letter-board-height min="0.001" max="10000" step="any" placeholder="Auto"></label>
            <label>Depth (mm)<input type="number" data-letter-board-depth min="0.001" max="10000" step="any" value="3"></label>
          </div>
          <p class="letter3d-note">Leave width or height empty to fit that dimension to the lettering.</p>
          <label>Backboard colour<select data-letter-board-colour><option value="clear">Clear</option><option value="#ffffff">White</option><option value="#171717">Black</option><option value="custom">Custom colour</option></select></label>
          <label data-letter-board-custom-label hidden>Custom backboard colour<input type="color" data-letter-board-custom value="#4466aa"></label>
          <label>Margin for automatic sizing (mm)<input type="number" data-letter-board-margin min="0" max="300" step="1" value="30"></label>
          <p class="letter3d-note">The backboard is a separate panel behind the lettering. The shop confirms its material and price.</p></div>
      </div></details>
      <details class="letter3d-group" open><summary>Your lettering</summary><div class="letter3d-group-body">
        <label>Lettering option <select data-letter-product required><option value="">Choose an option</option><?php foreach ($letterProducts as $p): ?><option value="<?= (int)$p['id'] ?>" data-min-width="<?= e((string)$p['min_width_mm']) ?>" data-max-width="<?= e((string)$p['max_width_mm']) ?>" data-min-height="<?= e((string)$p['min_height_mm']) ?>" data-max-height="<?= e((string)$p['max_height_mm']) ?>" data-max-chars="<?= (int)$p['max_characters'] ?>" data-max-quantity="<?= (int)$p['max_quantity'] ?>"><?= e($p['name']) ?><?= $p['description'] !== '' ? ' — ' . e($p['description']) : '' ?></option><?php endforeach ?></select></label>
        <?php if (!$letterProducts): ?><p class="letter3d-note">No lettering options have been configured for pricing yet. You can still contact the team to discuss your project.</p><?php endif ?>
        <p data-letter-font-notice role="status" hidden>A font from your saved design is unavailable. Review the replacement typeface before continuing.</p>
        <div hidden aria-hidden="true"><textarea data-letter-text maxlength="200" data-private>Your sign</textarea><select data-letter-font><?= $letterFontOptions ?></select><input type="color" data-letter-colour value="#ffffff"></div>
        <p class="letter3d-line-help">Create up to eight lines. Set the style, front and side colours, and position of each line.</p>
        <div class="letter3d-lines" data-letter-lines>
        <?php for ($line = 0; $line < 8; $line++): ?>
          <fieldset class="letter3d-line" data-letter-line="<?= $line ?>"<?= $line > 0 ? ' hidden' : '' ?>>
            <legend>Line <?= $line + 1 ?></legend>
            <label>Text<input type="text" data-letter-line-text="<?= $line ?>" value="<?= $line === 0 ? 'Your sign' : '' ?>" maxlength="200" autocomplete="off" data-private></label>
            <div class="letter3d-line-style">
              <label>Typeface<select data-letter-line-font="<?= $line ?>"><?= $letterFontOptions ?></select></label>
              <div class="letter3d-line-colours" role="group" aria-label="Colours for line <?= $line + 1 ?>">
                <?php foreach (['front'=>'Front', 'side'=>'Side'] as $area=>$areaLabel): ?>
                <div><label><?= e($areaLabel) ?> film<select data-letter-line-<?= e($area) ?>-film="<?= $line ?>"><option value="">Custom / not selected</option><?php foreach ($letterFilmCatalog['colours'] as $film): ?><option value="<?= e($film['code']) ?>"><?= e($film['code'].' — '.$film['name']) ?></option><?php endforeach ?></select></label>
                  <label><?= e($areaLabel) ?> colour<input type="color" <?= $area === 'front' ? 'data-letter-line-colour' : 'data-letter-line-side-colour' ?>="<?= $line ?>" value="#ffffff"></label></div>
                <?php endforeach ?>
              </div>
              <p class="letter3d-side-hint">Avery 500 swatches are approximate on screen; we confirm the physical colour and stock.</p>
              <div class="letter3d-line-finishes" role="group" aria-label="Film finishes for line <?= $line + 1 ?>">
                <label>Front finish<select data-letter-line-front-finish="<?= $line ?>"><option value="">Not specified</option><option value="matt">Matt</option><option value="gloss">Gloss</option></select></label>
                <label>Side finish<select data-letter-line-side-finish="<?= $line ?>"><option value="">Not specified</option><option value="matt">Matt</option><option value="gloss">Gloss</option></select></label>
              </div>
              <p class="letter3d-side-hint">The side shade follows the front until you choose a side colour. Finishes are checked with the final quotation.</p>
              <button type="button" class="letter3d-side-auto" data-letter-line-side-auto="<?= $line ?>" aria-label="Use automatic side shade for line <?= $line + 1 ?>">Use automatic side shade</button>
            </div>
            <details class="letter3d-line-position"><summary>Position and rotation</summary>
              <?php foreach (['x' => ['Horizontal offset (% of line width)', -200, 200, ''], 'y' => ['Vertical offset (% of line height)', -200, 200, ''], 'rotation' => ['Rotation', -180, 180, '°']] as $axis => [$title, $min, $max, $unit]): ?>
              <label class="letter3d-position-label"><?= e($title) ?> <span><?= e($unit) ?></span><input type="number" data-letter-line-<?= e($axis) ?>="<?= $line ?>" min="<?= $min ?>" max="<?= $max ?>" step="0.1" value="0" inputmode="decimal"><input type="range" data-letter-line-slider="<?= e($axis) ?>" data-line="<?= $line ?>" min="<?= $min ?>" max="<?= $max ?>" step="0.1" value="0" aria-label="<?= e($title) ?> for line <?= $line + 1 ?>"></label>
              <?php endforeach ?>
            </details>
            <button type="button" class="letter3d-remove-line" data-letter-remove-line="<?= $line ?>">Remove line</button>
          </fieldset>
        <?php endfor ?>
        </div>
        <button type="button" class="letter3d-add-line" data-letter-add-line>+ Add another line</button>
      </div></details>
      <details class="letter3d-group" open><summary>Letter depth</summary><div class="letter3d-group-body">
        <label>Overall letter depth<select data-letter-depth><option value="30">3 cm (30 mm)</option><option value="60" selected>6 cm (60 mm)</option><option value="100">10 cm (100 mm)</option></select></label>
        <p class="letter3d-note">Measured from the front face to the outside of the PVC back. Depth pricing is confirmed in the final quotation.</p>
      </div></details>
      <details class="letter3d-group letter3d-construction"><summary>Front-lit materials and construction</summary><div class="letter3d-group-body">
        <p>Our standard front-lit construction uses:</p>
        <ul><li data-letter-construction-front>Loading construction settings…</li><li data-letter-construction-side></li><li data-letter-construction-back></li><li data-letter-construction-film></li></ul>
        <p>The lighting preview is illustrative. We confirm film coverage, light transmission and construction with you before production.</p>
      </div></details>
      <details class="letter3d-group" open><summary>Size &amp; quantity</summary><div class="letter3d-group-body">
        <div class="letter3d-size-grid"><label>Finished width (mm) <input type="number" data-letter-width min="1" step="any" value="500" aria-describedby="letter3d-size-help"></label><label>Finished height (mm) <input type="number" data-letter-height min="1" step="any" aria-describedby="letter3d-size-help"></label></div>
        <small id="letter3d-size-help">Set either dimension. The other follows the proportions of your lettering.</small>
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
<?php foreach ($letterFonts as $key => $entry): ?>
@font-face{font-family:"Letter3D-<?= e($key) ?>";src:url("/public/assets/fonts/letter3d/<?= e($entry['file']) ?>") format("truetype");font-weight:400;font-display:swap}
<?php endforeach ?>
.letter3d-board-size{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem}.letter3d-board-size input{min-width:0;width:100%}
.letter3d-preview-line{font-weight:400;font-synthesis:none}
@font-face{font-family:Letter3DSans;src:url("/public/assets/fonts/letter3d/AlegreyaSans-Regular.ttf") format("truetype");font-display:swap}
@font-face{font-family:Letter3DSerif;src:url("/public/assets/fonts/letter3d/LibertinusSerif-Regular.ttf") format("truetype");font-display:swap}
@font-face{font-family:Letter3DScript;src:url("/public/assets/fonts/letter3d/GreatVibes-Regular.ttf") format("truetype");font-display:swap}
.quote-workspace:has(.letter3d-editor:not([hidden])){max-width:1420px}
body:has(.letter3d-editor:not([hidden])) .quote-hero{display:none}
.letter3d-editor{--l3-ink:#182236;--l3-muted:#536079;--l3-line:#d5dce6;color:var(--l3-ink);font:500 .94rem/1.5 "Inter","Segoe UI",sans-serif;min-width:0}
.letter3d-editor :where(button,input,select,textarea){font:inherit;box-sizing:border-box}.letter3d-editor button{cursor:pointer}.letter3d-editor button:disabled{opacity:.5;cursor:default}
.letter3d-editor :is(button,summary,input,select,textarea):focus-visible{outline:3px solid #4275dc;outline-offset:3px}
.letter3d-heading{display:flex;justify-content:space-between;gap:1rem;align-items:start;flex-wrap:wrap;margin:0 0 1rem}.letter3d-heading button{border:1px solid #bcc8d8;border-radius:7px;background:#fff;color:#182236;padding:.5rem .8rem}.letter3d-heading h2{color:var(--l3-ink);font-size:clamp(1.9rem,3vw,3rem);line-height:1.08;letter-spacing:-.045em;margin:0}.letter3d-heading p{color:var(--l3-muted);margin:.3rem 0 0}
.letter3d-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,370px);gap:1rem;align-items:start}.letter3d-stage,.letter3d-controls{min-width:0}.letter3d-view{background:#151b29;color:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px #12203d1a}
.letter3d-stage-bar,.letter3d-stage-footer{display:flex;align-items:center;justify-content:space-between;gap:.7rem;padding:.7rem;flex-wrap:wrap;background:#111827}.letter3d-scenes,.letter3d-zoom{display:flex;align-items:center;gap:.25rem}.letter3d-scenes button,.letter3d-zoom button{border:1px solid #465267;border-radius:7px;background:#273348;color:#f4f7fb;padding:.4rem .7rem}.letter3d-lights{display:inline-flex;align-items:center;gap:.4rem;border:1px solid #465267;border-radius:7px;background:#273348;color:#f4f7fb;padding:.4rem .65rem;font-weight:650;cursor:pointer}.letter3d-lights input{accent-color:#f4c925;width:1rem;height:1rem;margin:0}.letter3d-lights:focus-within{outline:3px solid #f4c925;outline-offset:2px}.letter3d-scenes button[aria-pressed="true"]{background:#f4c925;color:#172033;border-color:#f4c925}.letter3d-zoom output{min-width:3rem;text-align:center;font-size:.8rem}.letter3d-stage-footer>span{font-size:.75rem;color:#c5cedd}
.letter3d-price[data-updating]{position:relative}.letter3d-price[data-updating]>*{visibility:hidden}.letter3d-price[data-updating]::after{content:'Updating estimate…';position:absolute;inset:.4rem .7rem;font-size:.8rem}
.letter3d-price{display:grid;gap:0;background:#f3ca29;color:#172033;padding:.4rem .7rem;border-radius:8px;max-width:100%;line-height:1.3}.letter3d-price small{font-size:.7rem}.letter3d-price strong{font-size:.92rem}.letter3d-price span{font-size:.65rem;max-width:220px}
.letter3d-preview{position:relative;display:flex;align-items:center;justify-content:center;min-height:clamp(280px,42vw,520px);padding:25px;overflow:hidden;background:linear-gradient(150deg,#d6d9da,#a0a9af)}
.letter3d-view[data-scene="brick"] .letter3d-preview{background:linear-gradient(#ffebd83d,#dfcbbc35),url("/public/assets/neon/brick.jpg") center / 430px auto repeat #514944}
.letter3d-view[data-scene="concrete"] .letter3d-preview{background:linear-gradient(#f3f1e875,#d9ddd963),url("/public/assets/neon/concrete.jpg") center / 530px auto repeat #747775}
.letter3d-preview[data-render="three"]{cursor:grab;touch-action:none}.letter3d-preview[data-render="three"].is-orbiting{cursor:grabbing}.letter3d-preview:focus-visible{outline:3px solid #f4c925;outline-offset:-4px}.letter3d-orbit-hint{display:none}.letter3d-view:has(.letter3d-preview[data-render="three"]) .letter3d-orbit-hint{display:inline}
.letter3d-three{position:absolute;inset:0;pointer-events:none;visibility:hidden}.letter3d-three canvas{display:block;width:100%;height:100%}.letter3d-preview[data-render="three"] .letter3d-three{visibility:visible}.letter3d-preview[data-render="three"] > [data-letter-preview]{visibility:hidden}
.letter3d-preview > [data-letter-preview]{display:inline-block;flex-shrink:0;white-space:pre;text-align:center;font-size:clamp(32px,6vw,80px);line-height:1.2;text-shadow:1px 1px #8b9099,2px 2px #6a7079,3px 3px #484e57,4px 4px 7px #0009;transform-origin:center}
.letter3d-cutting{margin-top:1rem;border:1px solid #d5dce6;border-radius:12px;background:#fff;overflow:hidden}.letter3d-cutting summary{padding:.8rem 1rem;background:#f7f9fc;font-weight:750;cursor:pointer}.letter3d-cutting-body{padding:1rem}.letter3d-cutting-body p,.letter3d-cutting-body small{font-size:.82rem;color:#41516d}.letter3d-cutting-body svg{display:block;width:100%;height:clamp(180px,30vw,380px);background:#f5f8fc;border:1px solid #d5dce6;border-radius:8px;touch-action:none;cursor:grab}.letter3d-cutting-zoom{display:flex;align-items:center;gap:.35rem;margin-top:.5rem}.letter3d-cutting-zoom button{min-width:2rem;margin:0;padding:.35rem .55rem;border:1px solid #b8c9df;border-radius:6px;background:#fff;color:#183c6c}.letter3d-cutting-zoom output{min-width:3rem;text-align:center;font-size:.8rem}.letter3d-cutting-zoom small{margin-left:.4rem}.letter3d-cutting-body svg[hidden]{display:none}.letter3d-cutting-body button{margin:.3rem .5rem .5rem 0}.letter3d-cutting-body small{display:block}.letter3d-disclaimer,.letter3d-limits,.letter3d-note{font-size:.82rem;color:var(--l3-muted)}.letter3d-disclaimer{margin:.65rem .2rem}.letter3d-controls{display:grid;gap:.7rem}.letter3d-group{border:1px solid var(--l3-line);background:#fff;border-radius:12px;overflow:hidden}.letter3d-group summary{cursor:pointer;font-weight:750;padding:.8rem 1rem;background:#f7f9fc}.letter3d-group-body{padding:1rem}.letter3d-controls label{display:grid;gap:.3rem;font-weight:650;margin:0 0 .8rem}.letter3d-controls :is(input:not([type="color"]),select,textarea){width:100%;min-width:0;padding:.6rem .65rem;border:1px solid #bcc8d8;border-radius:7px;background:#fff;color:#182236}.letter3d-controls input[type="color"]{width:3rem;height:2.5rem;padding:.15rem;border:1px solid #bcc8d8;border-radius:7px;background:#fff}.letter3d-size-grid{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}.letter3d-request p{font-size:.84rem}.letter3d-request [data-letter-status]{min-height:1.5em}.letter3d-send{width:100%}
.letter3d-line-help{color:var(--l3-muted);font-size:.84rem;margin:.4rem 0 .7rem}.letter3d-lines{display:grid;gap:.75rem}.letter3d-line{border:1px solid #d5dce6;border-radius:9px;padding:.65rem .75rem .75rem;min-width:0;margin:0;background:#f9fbfe}.letter3d-line[hidden]{display:none}.letter3d-line legend{font-weight:750;padding:0 .35rem;color:var(--l3-ink)}.letter3d-line-style{display:grid;grid-template-columns:minmax(0,1fr);gap:0}.letter3d-line-colours{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;align-items:start}.letter3d-line-colours label,.letter3d-line-colours>div{min-width:0}.letter3d-line-finishes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.letter3d-line-finishes label{min-width:0}.letter3d-construction p,.letter3d-construction ul{font-size:.82rem;color:var(--l3-muted);margin:.2rem 0 .7rem}.letter3d-construction ul{padding-left:1.15rem}.letter3d-construction li{margin:.25rem 0}.letter3d-side-hint{color:var(--l3-muted);font-size:.78rem;line-height:1.4;margin:-.3rem 0 .35rem}.letter3d-side-auto{justify-self:start;border:0;background:none;color:#16468a;padding:.1rem 0;font-size:.78rem;font-weight:700;text-decoration:underline;text-underline-offset:.15em;margin:0 0 .65rem}.letter3d-line-position{border-top:1px solid #dce3ed;margin:.1rem 0 .7rem;padding-top:.35rem}.letter3d-line-position summary{padding:.3rem 0;background:transparent;font-size:.85rem;color:#31486b}.letter3d-position-label{display:grid!important;grid-template-columns:1fr auto 5rem;align-items:center;gap:.35rem!important;font-size:.83rem;margin:.6rem 0!important}.letter3d-position-label input[type=number]{grid-column:3;padding:.3rem .45rem}.letter3d-position-label input[type=range]{grid-column:1/-1;padding:0;accent-color:#1c58b8}.letter3d-add-line,.letter3d-remove-line{border:1px solid #bfcde2;background:#fff;color:#16468a;border-radius:7px;padding:.45rem .7rem;font-weight:700}.letter3d-add-line{margin-top:.75rem;width:100%}.letter3d-remove-line{font-size:.8rem}.letter3d-add-line:disabled{opacity:.5}
@media(max-width:800px){.letter3d-layout{grid-template-columns:1fr}.letter3d-preview{min-height:260px}.letter3d-price{margin-left:auto}.letter3d-heading h2{font-size:2rem}}
@media(max-width:420px){.letter3d-stage-bar{align-items:start}.letter3d-scenes button{padding:.35rem .5rem}.letter3d-price{margin-left:0}.letter3d-size-grid{grid-template-columns:1fr}}

/* The document scrolls the settings. The title and drawing stay below the site menu. */
.letter3d-editor {
  --l3-nav-height: 5rem;
  --l3-title-height: 5rem;
  --l3-stage-top: calc(var(--l3-nav-height) + var(--l3-title-height));
  --l3-stage-room: calc(100dvh - var(--l3-stage-top) - .5rem);
  --l3-control-inset: var(--l3-stage-top);
}
.letter3d-heading {
  position: sticky;
  top: var(--l3-nav-height);
  z-index: 5;
  align-items: center;
  margin: 0;
  padding-block: .45rem .65rem;
  background: #f3f5f9;
}
.letter3d-stage {
  position: sticky;
  top: var(--l3-stage-top);
  max-height: var(--l3-stage-room);
}
@media (min-width: 801px) {
  .letter3d-stage { display: flex; flex-direction: column; }
  .letter3d-stage > :not(.letter3d-view) { flex: none; }
  .letter3d-stage:has(.letter3d-cutting[open]) { display: block; overflow-y: auto; }
}
.letter3d-view {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
  height: min(calc(clamp(280px, 42vw, 520px) + 8rem), calc(var(--l3-stage-room) - 3.75rem));
}
.letter3d-preview {
  min-height: 0;
}
.letter3d-controls :is(input, select, textarea, button, summary) {
  scroll-margin-block-start: calc(var(--l3-control-inset) + .5rem);
}
@media (max-width: 800px) {
  .letter3d-editor { --l3-control-inset: calc(var(--l3-stage-top) + var(--l3-view-height, 36dvh)); }
  .letter3d-layout { display: block; }
  .letter3d-stage { display: contents; }
  .letter3d-view {
    position: sticky;
    top: var(--l3-stage-top);
    z-index: 4;
    height: auto;
    grid-template-rows: auto clamp(6rem, 19dvh, 12rem) auto;
  }
  .letter3d-preview { height: auto; padding: 0; }
  .letter3d-heading { flex-wrap: nowrap; gap: .5rem; padding-block: .35rem; }
  .letter3d-heading h2 { font-size: clamp(1.15rem, 5vw, 1.6rem); }
  .letter3d-heading p, .letter3d-view:has(.letter3d-preview[data-render="three"]) .letter3d-orbit-hint { display: none; }
  .letter3d-heading button { flex: none; padding: .3rem .55rem; }
  .letter3d-stage-bar, .letter3d-stage-footer { gap: .25rem .45rem; padding: .35rem .5rem; }
  .letter3d-stage-bar, .letter3d-zoom { font-size: .8rem; }
  .letter3d-scenes button, .letter3d-zoom button, .letter3d-lights { padding: .25rem .4rem; }
  .letter3d-price { padding: .2rem .5rem; }
  .letter3d-stage-footer > [data-letter-render-status] { flex: 1; text-align: right; line-height: 1.15; }
  .letter3d-cutting :is(input, select, button, summary, a) {
    scroll-margin-block-start: calc(var(--l3-control-inset) + .5rem);
  }
}
@media (max-width: 420px) {
  .letter3d-stage-bar { justify-content: start; align-items: center; }
  .letter3d-price { flex: 1 1 100%; grid-template-columns: auto 1fr; align-items: baseline; gap: 0 .45rem; }
  .letter3d-price strong { text-align: right; }
  .letter3d-price span { grid-column: 1 / -1; max-width: none; }
}
@media (min-width: 580px) and (max-width: 800px) and (max-height: 500px) {
  .letter3d-view { grid-template-rows: auto clamp(5rem, 23dvh, 8rem); }
  .letter3d-stage-footer { position: absolute; bottom: .25rem; right: .25rem; border-radius: .4rem; padding: .15rem; }
  .letter3d-view:has(.letter3d-preview[data-render="three"]) [data-letter-render-status] {
    position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);
  }
}
</style>
<script defer src="/public/assets/js/letter3d-editor.js?v=<?= e((string)filemtime(__DIR__ . '/../../../public/assets/js/letter3d-editor.js')) ?>"></script>
