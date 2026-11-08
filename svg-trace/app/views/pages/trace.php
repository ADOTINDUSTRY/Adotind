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
  <div class="wrap ws-grid" id="ws" data-presets="<?= StSecurity::e(json_encode($presetJson)) ?>" data-max-bytes="<?= $maxBytes ?>" data-exts="<?= StSecurity::e(json_encode($exts)) ?>" data-preview="<?= StSecurity::e(json_encode($preview)) ?>" data-labels="<?= StSecurity::e(implode(', ', $labels)) ?>">
    <aside class="ws-panel">
      <h1 class="ws-title">Trace an image</h1>

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
      <p class="muted fine">Files are private and deleted automatically after 30 days.</p>
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
          <span class="muted fine" id="hint">Tip: for neon signs choose Centre lines; for laser / CNC cutting choose Outlines.</span>
        </div>
      </div>
    </div>
  </div>
</section>
