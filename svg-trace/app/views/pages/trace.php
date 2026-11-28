<?php
/** @var array $page */
$presets = $page['presets'];
$maxBytes = (int)$page['upload']['max_bytes'];
$maxSize = $maxBytes >= 1073741824 ? round($maxBytes / 1073741824, 1) . ' GB' : round($maxBytes / 1048576) . ' MB';
$maxPx = number_format((int)$page['upload']['max_dimension_px']);
$formats = $page['upload']['formats'];
$exts = [];
$preview = [];
foreach ($formats as [$label, $list, $browser]) {
    foreach ($list as $e) {
        $exts[] = $e;
        if ($browser) {
            $preview[] = $e;
        }
    }
}
$labels = array_column($formats, 0);
$presetJson = [];
foreach ($presets as $k => $p) {
    unset($p['label']);
    $presetJson[$k] = $p;
}
// name => [label, min, max, step, help, only-for (optional)]
$simple = [
    'colors' => ['Colours', 0, 32, 1, 'How many colours to keep. 0 = automatic.', 'color'],
    'threshold' => ['Black / white cut-off', 1, 254, 1, 'Pixels darker than this become black.', 'bw'],
    'filter_speckle' => ['Remove specks', 0, 16, 1, 'Ignore dust and noise smaller than this.'],
    'segment_length' => ['Smoothness', 3.5, 10, 0.5, 'Higher gives smoother, simpler lines.'],
    'corner_threshold' => ['Corner sharpness', 0, 180, 1, 'Lower keeps more sharp corners.'],
];
$advanced = [
    'splice_threshold' => ['Curve splitting', 0, 180, 1, 'Angle at which a curve is split.', 'shapes'],
    'path_precision' => ['Decimal places', 0, 8, 1, 'Fewer decimals give a smaller file.'],
];
$slider = static function (string $name, array $s): void { ?>
        <label class="field range"<?= isset($s[5]) ? ' data-only="' . $s[5] . '"' : '' ?>>
          <span><?= StSecurity::e($s[0]) ?> <output id="o-<?= $name ?>"></output></span>
          <input type="range" name="<?= $name ?>" min="<?= $s[1] ?>" max="<?= $s[2] ?>" step="<?= $s[3] ?>" />
          <small class="muted"><?= StSecurity::e($s[4]) ?></small>
        </label>
<?php };
?>
<section class="section-st ws">
  <div class="wrap ws-grid" id="ws"<?= !empty($page['private_trace']) ? ' data-convert-url="/online-quote/svg-trace/convert"' : '' ?> data-presets="<?= StSecurity::e(json_encode($presetJson)) ?>" data-max-bytes="<?= $maxBytes ?>" data-exts="<?= StSecurity::e(json_encode($exts)) ?>" data-preview="<?= StSecurity::e(json_encode($preview)) ?>" data-labels="<?= StSecurity::e(implode(', ', $labels)) ?>">
    <aside class="ws-panel">
      <h1 class="ws-title"><?= !empty($page['private_trace']) ? 'A Dot SVG Trace' : 'Trace an image' ?></h1>

      <label class="drop" id="drop" for="file">
        <input type="file" id="file" name="image" accept="<?= StSecurity::e(implode(',', array_map(static fn(string $e): string => '.' . $e, $exts))) ?>" hidden />
        <strong id="drop-label">Drop an image here or click to choose</strong>
        <span class="muted"><?= StSecurity::e(implode(', ', $labels)) ?></span>
        <span class="muted">Up to <?= $maxSize ?> · <?= $maxPx ?> px</span>
        <span class="progress" id="progress" hidden><span></span></span>
      </label>

      <label class="field">
        <span>Style</span>
        <select id="preset">
          <?php foreach ($presets as $key => $p): ?>
            <option value="<?= StSecurity::e($key) ?>"><?= StSecurity::e($p['label']) ?></option>
          <?php endforeach; ?>
        </select>
      </label>

      <div class="field">
        <span>Output</span>
        <div class="seg seg-out" role="group" aria-label="Output">
          <label title="Solid coloured shapes"><input type="radio" name="output" value="fill" /> Filled</label>
          <label title="Only the outline of every shape (cutting, outline neon)"><input type="radio" name="output" value="outline" /> Outlines</label>
          <label title="One single line through the middle of every stroke (neon flex, engraving)"><input type="radio" name="output" value="centerline" /> Centre lines</label>
        </div>
      </div>

      <div class="field" data-only="font" hidden>
        <span>Letter colour in your image</span>
        <div class="seg" role="group" aria-label="Letter colour">
          <label><input type="radio" name="ink" value="auto" checked /> Auto</label>
          <label><input type="radio" name="ink" value="dark" /> Dark letters</label>
          <label><input type="radio" name="ink" value="light" /> Light letters</label>
        </div>
        <small class="muted">Trace the letter edges, dots and inner holes. Adjust the black / white cut-off to recover fine strokes.</small>
      </div>

      <div class="field">
        <span>Background</span>
        <div class="seg" role="group" aria-label="Background">
          <label title="Keep the background as a shape"><input type="radio" name="remove_bg" value="0" /> Keep</label>
          <label title="Remove the background around the artwork"><input type="radio" name="remove_bg" value="1" /> Remove</label>
          <label title="Also remove background inside letters and holes"><input type="radio" name="remove_bg" value="2" /> Remove all</label>
        </div>
      </div>

      <div class="seg" role="group" aria-label="Colour mode">
        <label><input type="radio" name="colormode" value="color" /> Colour</label>
        <label><input type="radio" name="colormode" value="bw" /> Black &amp; white</label>
      </div>

      <?php foreach ($simple as $name => $s) { $slider($name, $s); } ?>

      <details class="adv">
        <summary>More settings</summary>
        <div class="seg" role="group" aria-label="Layers" data-only="shapes">
          <label><input type="radio" name="hierarchical" value="stacked" /> Stacked</label>
          <label><input type="radio" name="hierarchical" value="cutout" /> Cut-out</label>
        </div>
        <div class="seg" role="group" aria-label="Curve type">
          <label><input type="radio" name="mode" value="spline" /> Curves</label>
          <label><input type="radio" name="mode" value="polygon" /> Straight</label>
          <label data-only="shapes"><input type="radio" name="mode" value="pixel" /> Pixel</label>
          <label data-only="shapes" title="Sharp corners, exact straight lines and smooth curves: best for letters and CNC cutting"><input type="radio" name="mode" value="precise" /> Precise</label>
        </div>
        <?php foreach ($advanced as $name => $s) { $slider($name, $s); } ?>
      </details>

      <label class="check"><input type="checkbox" id="auto" checked /> Update automatically when I change a setting</label>
      <button class="btn btn-primary btn-lg ws-go" id="go" type="button" disabled>Convert to SVG</button>
      <?php if (!empty($page['private_trace'])): ?>
      <button class="btn btn-primary ws-go" id="review-traced-points" type="button" hidden>Review traced points with AI</button>
      <button class="btn btn-sm" id="ai-trace" type="button" disabled>Redraw image with AI</button>
      <?php endif; ?>
      <p class="muted fine"><?= !empty($page['private_trace']) ? 'Download your SVG to keep your edits. Uploaded logos are removed after conversion.' : 'Files are private and deleted automatically after 30 days.' ?></p>
    </aside>

    <div class="ws-stage">
      <div class="ws-status" id="status" role="status" aria-live="polite">Choose an image to begin.</div>
      <div class="ws-view" id="view" hidden>
        <div class="ws-bar">
          <div class="ws-tabs" role="tablist">
            <button type="button" class="on" data-show="split">Side by side</button>
            <button type="button" data-show="overlay">Compare</button>
            <button type="button" data-show="vector">Vector</button>
            <button type="button" data-show="original">Original</button>
          </div>
          <div class="ws-zoom" role="group" aria-label="Zoom">
            <button type="button" data-zoom="out" title="Zoom out">−</button>
            <span id="zoom-level">Fit</span>
            <button type="button" data-zoom="in" title="Zoom in">+</button>
            <button type="button" data-zoom="fit" title="Fit to window">Fit</button>
            <button type="button" data-zoom="1" title="Actual size">100%</button>
          </div>
          <label class="check"><input type="checkbox" id="wire" /> Show lines only</label>
        </div>
        <div class="ws-canvas split" id="canvas">
          <figure><div class="vp"><img id="img-original" alt="Original image" draggable="false" /></div><figcaption>Original</figcaption></figure>
          <figure><div class="vp"><img id="img-vector" alt="Traced SVG" draggable="false" /></div><figcaption>Vector (SVG)</figcaption></figure>
          <input type="range" id="swipe" min="0" max="100" value="50" aria-label="Compare position" />
        </div>
        <p class="muted fine ws-help">Scroll to zoom, drag to move. In Compare, slide to reveal the original under the vector.</p>
        <div class="ws-stats" id="stats"></div>
        <div class="ws-actions">
          <a class="btn btn-primary" id="download" href="#" download hidden>Download SVG</a>
          <button class="btn" id="edit" type="button" hidden title="Move, add or remove points and fix curves by hand">Edit points</button>
          <span class="muted fine" id="hint">Tip: for neon signs choose Centre lines; for laser / CNC cutting choose Outlines.</span>
        </div>
      </div>
    </div>
  </div>
  <div class="ed" id="ed" hidden role="dialog" aria-modal="true" aria-label="Edit points">
    <div class="ed-bar">
      <strong class="ed-title">Edit points</strong>
      <?php if (!empty($page['private_trace'])): ?>
      <button type="button" class="btn btn-sm ed-refine-toggle" id="ed-ai" aria-expanded="false" aria-controls="ed-refine-panel">AI curve review</button>
      <?php endif; ?>
      <div class="ed-group">
        <button type="button" class="btn btn-sm" id="ed-undo" title="Undo (Ctrl / Cmd + Z)">Undo</button>
        <button type="button" class="btn btn-sm" id="ed-redo" title="Redo (Ctrl / Cmd + Shift + Z)">Redo</button>
        <button type="button" class="btn btn-sm" id="ed-add" title="Insert a point on the selected segment (I)">Add point</button>
        <button type="button" class="btn btn-sm" id="ed-straight" title="Straighten the selected segment or point (L)">Straight</button>
        <button type="button" class="btn btn-sm" id="ed-curve" title="Convert to a Bézier curve (C)">Curve</button>
        <button type="button" class="btn btn-sm" id="ed-smooth" title="Smooth the selected point (S)">Smooth</button>
        <button type="button" class="btn btn-sm" id="ed-delete" title="Remove the selected point (Delete or Backspace)">Delete point</button>
        <button type="button" class="btn btn-sm" id="ed-delete-shape" title="Remove the selected shape and all its contours (Shift + Delete)">Delete shape</button>
      </div>
      <div class="ed-group">
        <button type="button" class="btn btn-sm" id="ed-out" title="Zoom out">−</button>
        <button type="button" class="btn btn-sm" id="ed-in" title="Zoom in">+</button>
        <button type="button" class="btn btn-sm" id="ed-fit">Fit</button>
        <button type="button" class="btn btn-sm" id="ed-fit-shape" title="Fit the selected letter or shape (F)">Fit shape</button>
        <label class="check"><input type="checkbox" id="ed-orig" checked /> Show original</label>
      </div>
      <div class="ed-group ed-end">
        <button type="button" class="btn btn-sm" id="ed-font" title="Trace this image again using the lettering preset">Trace lettering</button>
        <button type="button" class="btn btn-sm" id="ed-download">Download edited SVG</button>
        <button type="button" class="btn btn-sm btn-primary" id="ed-apply">Done</button>
        <button type="button" class="btn btn-sm" id="ed-cancel">Cancel</button>
      </div>
    </div>
    <div class="ed-workspace">
      <svg class="ed-svg" id="ed-svg" tabindex="0" aria-label="Curve editing canvas" xmlns="http://www.w3.org/2000/svg"></svg>
      <?php if (!empty($page['private_trace'])): ?>
      <aside class="ed-refine-panel" id="ed-refine-panel" aria-labelledby="ed-refine-title" hidden>
        <div class="ed-refine-heading">
          <h2 id="ed-refine-title">AI curve review</h2>
          <button class="btn btn-sm" type="button" id="ed-refine-close" aria-label="Close curve review" title="Close curve review">Close</button>
        </div>
        <p id="ed-refine-status" role="status" aria-live="polite" aria-atomic="true"></p>
        <section id="ed-refine-review" aria-label="Suggested edits" hidden>
          <div class="ed-refine-navigation">
            <strong id="ed-refine-count" aria-live="polite" aria-atomic="true"></strong>
            <button class="btn btn-sm" type="button" id="ed-refine-prev" aria-label="Previous suggestion" title="Previous suggestion">←</button>
            <button class="btn btn-sm" type="button" id="ed-refine-next" aria-label="Next suggestion" title="Next suggestion">→</button>
          </div>
          <p id="ed-refine-reason"></p>
          <div class="ed-refine-legend" aria-label="Canvas line styles">
            <span><i aria-hidden="true"></i>Current</span>
            <span><i aria-hidden="true"></i>Proposed</span>
          </div>
          <div class="ed-refine-actions">
            <button class="btn btn-sm btn-primary" type="button" id="ed-refine-apply">Apply this</button>
            <button class="btn btn-sm" type="button" id="ed-refine-skip">Skip this</button>
            <button class="btn btn-sm" type="button" id="ed-refine-all">Apply all</button>
          </div>
        </section>
        <div class="ed-refine-fields">
          <label for="ed-refine-scope">Review</label>
          <select id="ed-refine-scope">
            <option value="drawing">Whole drawing</option>
            <option value="contour">Selected contour</option>
            <option value="point">Selected point or segment</option>
          </select>
          <label for="ed-refine-instruction">Instructions <span class="muted">(optional)</span></label>
          <textarea id="ed-refine-instruction" rows="2" maxlength="350" placeholder="Smooth the curves but keep the sharp corners."></textarea>
        </div>
        <div class="ed-refine-actions">
          <button type="button" class="btn btn-sm btn-primary" id="ed-refine-run">Ask AI</button>
          <button type="button" class="btn btn-sm" id="ed-refine-local" title="Find cleanup suggestions on this device">Quick cleanup</button>
        </div>
      </aside>
      <?php endif; ?>
    </div>
    <div class="ed-foot">
      <span id="ed-info"></span>
      <span class="muted">Double-click a line to add a point. Drag a square to move it or a round handle to reshape the curve.</span>
      <details class="ed-keys" id="ed-keys">
        <summary>Keyboard shortcuts <kbd>?</kbd></summary>
        <dl>
          <dt>S / C / L</dt><dd>Smooth point / convert to curve / straighten</dd>
          <dt>I</dt><dd>Insert a point where you selected a segment</dd>
          <dt>Delete / Backspace</dt><dd>Remove one point</dd>
          <dt>Shift + Delete</dt><dd>Remove the whole shape</dd>
          <dt>[ / ]</dt><dd>Previous / next point, including inner contours</dd>
          <dt>Arrow keys</dt><dd>Nudge a point. Hold Shift for ten steps</dd>
          <dt>Alt + drag handle</dt><dd>Move one handle independently</dd>
          <dt>F / 0</dt><dd>Fit selected shape / fit all artwork</dd>
          <dt>Ctrl / Cmd + Z</dt><dd>Undo. Add Shift to redo</dd>
          <dt>Ctrl + Y</dt><dd>Redo</dd>
          <dt>Esc</dt><dd>Close shortcuts or clear selection</dd>
        </dl>
      </details>
    </div>
  </div>
  <?php if (!empty($page['private_trace'])): ?>
  <dialog id="trace-ai-dialog" class="trace-ai-dialog" aria-labelledby="trace-ai-title">
    <form method="dialog" class="ai-heading"><h2 id="trace-ai-title">AI Trace</h2><button class="btn btn-sm" aria-label="Close">Close</button></form>
    <label class="field"><span id="trace-ai-label">What would you like to trace?</span>
      <textarea id="trace-ai-instruction" rows="2" maxlength="350"></textarea>
    </label>
    <div class="ai-compare">
      <figure><figcaption id="trace-ai-before-label">Original</figcaption><div id="trace-ai-before"></div></figure>
      <figure><figcaption>Proposed curves</figcaption><div id="trace-ai-after"></div></figure>
    </div>
    <p role="status" aria-live="polite" id="trace-ai-status"></p>
    <div class="ws-actions"><button type="button" class="btn" id="trace-ai-generate">Generate preview</button>
      <button type="button" class="btn btn-primary" id="trace-ai-apply" disabled>Use these curves</button></div>
  </dialog>
  <?php endif; ?>
</section>
