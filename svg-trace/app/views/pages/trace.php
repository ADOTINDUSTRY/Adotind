<?php
/** @var array $page */
$presets = $page['presets'];
$maxMb = round(((int)$page['upload']['max_bytes']) / 1048576, 1);
$maxPx = (int)$page['upload']['max_dimension_px'];
$presetJson = [];
foreach ($presets as $k => $p) {
    unset($p['label']);
    $presetJson[$k] = $p;
}
$sliders = [
    'filter_speckle' => ['Remove specks', 0, 16, 1, 'Ignore spots smaller than this size.'],
    'color_precision' => ['Colour detail', 1, 8, 1, 'Higher keeps more colour shades.', 'color'],
    'gradient_step' => ['Colour merging', 0, 128, 1, 'Higher merges similar colours into fewer layers.', 'color'],
    'corner_threshold' => ['Corner sharpness', 0, 180, 1, 'Lower keeps more sharp corners.'],
    'segment_length' => ['Curve smoothness', 3.5, 10, 0.5, 'Higher gives smoother, simpler curves.'],
    'splice_threshold' => ['Curve splitting', 0, 180, 1, 'Angle at which a curve is split.'],
    'path_precision' => ['Decimal places', 0, 8, 1, 'Fewer decimals give a smaller file.'],
];
?>
<section class="section-st ws">
  <div class="wrap ws-grid" id="ws" data-presets="<?= StSecurity::e(json_encode($presetJson)) ?>" data-max-bytes="<?= (int)$page['upload']['max_bytes'] ?>">
    <aside class="ws-panel">
      <h1 class="ws-title">Trace an image</h1>

      <label class="drop" id="drop" for="file">
        <input type="file" id="file" name="image" accept=".png,.jpg,.jpeg,.bmp,.webp,image/png,image/jpeg,image/bmp,image/webp" hidden />
        <strong id="drop-label">Drop an image here or click to choose</strong>
        <span class="muted">PNG, JPG, BMP or WEBP · up to <?= $maxMb ?> MB · max <?= $maxPx ?> px</span>
      </label>

      <label class="field">
        <span>Style</span>
        <select id="preset">
          <?php foreach ($presets as $key => $p): ?>
            <option value="<?= StSecurity::e($key) ?>"><?= StSecurity::e($p['label']) ?></option>
          <?php endforeach; ?>
        </select>
      </label>

      <details class="adv">
        <summary>Advanced settings</summary>
        <div class="seg" role="group" aria-label="Colour mode">
          <label><input type="radio" name="colormode" value="color" /> Colour</label>
          <label><input type="radio" name="colormode" value="bw" /> Black &amp; white</label>
        </div>
        <div class="seg" role="group" aria-label="Layers" data-only="color">
          <label><input type="radio" name="hierarchical" value="stacked" /> Stacked</label>
          <label><input type="radio" name="hierarchical" value="cutout" /> Cut-out</label>
        </div>
        <div class="seg" role="group" aria-label="Curve type">
          <label><input type="radio" name="mode" value="spline" /> Curves</label>
          <label><input type="radio" name="mode" value="polygon" /> Straight</label>
          <label><input type="radio" name="mode" value="pixel" /> Pixel</label>
        </div>
        <?php foreach ($sliders as $name => $s): ?>
          <label class="field range"<?= isset($s[5]) ? ' data-only="' . $s[5] . '"' : '' ?>>
            <span><?= StSecurity::e($s[0]) ?> <output id="o-<?= $name ?>"></output></span>
            <input type="range" name="<?= $name ?>" min="<?= $s[1] ?>" max="<?= $s[2] ?>" step="<?= $s[3] ?>" />
            <small class="muted"><?= StSecurity::e($s[4]) ?></small>
          </label>
        <?php endforeach; ?>
      </details>

      <button class="btn btn-primary btn-lg ws-go" id="go" type="button" disabled>Convert to SVG</button>
      <p class="muted fine">Files are private and deleted automatically after 30 days.</p>
    </aside>

    <div class="ws-stage">
      <div class="ws-status" id="status" role="status" aria-live="polite">Choose an image to begin.</div>
      <div class="ws-view" id="view" hidden>
        <div class="ws-tabs" role="tablist">
          <button type="button" class="on" data-show="split">Side by side</button>
          <button type="button" data-show="vector">Vector</button>
          <button type="button" data-show="original">Original</button>
        </div>
        <div class="ws-canvas split" id="canvas">
          <figure><img id="img-original" alt="Original image" /><figcaption>Original</figcaption></figure>
          <figure><img id="img-vector" alt="Traced SVG" /><figcaption>Vector (SVG)</figcaption></figure>
        </div>
        <div class="ws-stats" id="stats"></div>
        <div class="ws-actions">
          <a class="btn btn-primary" id="download" href="#" download hidden>Download SVG</a>
          <span class="muted fine" id="hint">Change settings and press Convert again to re-trace the same image.</span>
        </div>
      </div>
    </div>
  </div>
</section>
