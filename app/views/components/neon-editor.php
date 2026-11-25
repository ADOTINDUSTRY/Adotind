<?php
$neonColours = neon_color_palette();
$neonCovers = ['#ffffff' => $neonColours['#ffffff']] + array_diff_key($neonColours, ['#ffedcc' => true]);
$neonIcons = [
    'undo' => 'M9 5 4 10l5 5 M4 10h9a6 6 0 0 1 6 6v2',
    'redo' => 'm15 5 5 5-5 5 M20 10h-9a6 6 0 0 0-6 6v2',
    'open' => 'M3 18V6h6l2 2h9v3 M3 18l2-7h17l-3 8H3z',
    'save' => 'M12 3v12m-5-5 5 5 5-5 M4 16v4h16v-4',
    'power' => 'M12 3v8 M7 5.3a8 8 0 1 0 10 0',
    'fit' => 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
    'search' => 'M16 16l5 5 M18 10a8 8 0 1 1-16 0a8 8 0 0 1 16 0',
    'close' => 'M6 6l12 12 M18 6 6 18',
    'next' => 'm9 5 7 7-7 7',
    'previous' => 'm15 5-7 7 7 7',
    'expand' => 'M8 3H3v5 M3 3l6 6 M16 3h5v5 M21 3l-6 6 M3 16v5h5 M3 21l6-6 M16 21h5v-5 M21 21l-6-6',
    'left' => 'M3 6h18 M3 12h11 M3 18h15',
    'center' => 'M3 6h18 M7 12h10 M5 18h14',
    'right' => 'M3 6h18 M10 12h11 M6 18h15',
];
$neonIcon = static function (string $key) use ($neonIcons): string {
    return '<svg class="neon-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' . $neonIcons[$key] . '"/></svg>';
};
?>
<section class="neon-studio" data-project-panel="neon" data-neon-editor data-scene="studio" data-power="on" aria-labelledby="neon-title" hidden>
  <header class="neon-heading">
    <div>
      <h2 id="neon-title" tabindex="-1">Neon designer</h2>
      <p class="neon-use">Indoor use only</p>
    </div>
    <div class="neon-file-actions">
      <button type="button" data-neon-action="import-project"><?= $neonIcon('open') ?> Open design</button>
      <button type="button" data-neon-action="export-project"><?= $neonIcon('save') ?> Save design</button>
      <input type="file" data-neon-import data-private accept=".json,application/json" hidden>
    </div>
  </header>
  <div class="neon-workbench">
    <div class="neon-proof">
      <div class="neon-view">
        <div class="neon-stage-bar">
          <fieldset class="neon-scenes"><legend class="neon-visually-hidden">Preview background</legend>
            <?php foreach (['studio'=>'Studio', 'brick'=>'Brick', 'concrete'=>'Concrete', 'drawing'=>'Drawing'] as $scene => $label): ?>
              <button type="button" data-neon-choice="scene" data-value="<?= $scene ?>" aria-pressed="<?= $scene === 'studio' ? 'true' : 'false' ?>"><?= $label ?></button>
            <?php endforeach; ?>
          </fieldset>
          <label class="neon-power" title="Toggle neon lighting">
            <input type="checkbox" data-neon-field="power" checked><span><?= $neonIcon('power') ?> Lights</span>
          </label>
        </div>
        <div class="neon-drawing-area">
          <svg data-neon-canvas role="img" aria-label="Preview of your sign with 6 mm neon tubing"></svg>
        </div>
        <div class="neon-stage-footer">
          <div class="neon-zoom">
            <button type="button" data-neon-action="zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
            <output data-neon-output="zoom" aria-label="Zoom level">100%</output>
            <button type="button" data-neon-action="zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
            <button type="button" data-neon-action="fit" aria-label="Fit sign in preview" title="Fit sign in preview"><?= $neonIcon('fit') ?></button>
            <button type="button" data-neon-action="expand" aria-label="Expand preview" title="Expand preview" aria-haspopup="dialog" aria-controls="neon-expanded-proof" aria-expanded="false"><?= $neonIcon('expand') ?></button>
          </div>
          <div class="neon-history">
            <button type="button" data-neon-action="undo" aria-label="Undo" title="Undo"><?= $neonIcon('undo') ?></button>
            <button type="button" data-neon-action="redo" aria-label="Redo" title="Redo"><?= $neonIcon('redo') ?></button>
          </div>
        </div>
      </div>
      <dl class="neon-measurements">
        <div><dt>Lettering size</dt><dd data-neon-output="size">—</dd></div>
        <div><dt>Tube width</dt><dd>6 mm</dd></div>
        <div><dt>12 V strip · rated load (7.2 W/m, 120 LEDs/m)</dt><dd data-neon-output="electrical">—</dd></div>
        <div><dt>Tube length</dt><dd data-neon-output="length">—</dd></div>
      </dl>
      <p class="neon-warning" data-neon-output="warnings" role="status"></p>
      <div class="neon-proof-actions">
        <label class="neon-wall-picker"><?= $neonIcon('open') ?> Try your wall
          <input type="file" data-neon-wall data-private accept="image/jpeg,image/png,image/webp" aria-label="Preview the sign on your wall photo">
        </label>
        <button type="button" data-neon-action="clear-wall">Remove photo</button>
        <button type="button" data-neon-action="export-svg" disabled><?= $neonIcon('save') ?> Export SVG</button>
        <button type="button" data-neon-action="export-dxf" disabled><?= $neonIcon('save') ?> Export DXF</button>
        <span data-neon-output="status" role="status"></span>
      </div>
    </div>

    <div class="neon-controls">
      <details class="neon-group" open>
        <summary>Lettering</summary>
        <div class="neon-group-body">
          <div class="neon-label-pair"><label for="neon-message">Sign text</label><output data-neon-output="chars">5 / 80</output></div>
          <textarea id="neon-message" data-neon-field="text" data-private rows="2" maxlength="160" placeholder="Enter your sign text" spellcheck="false">Hello</textarea>
          <fieldset class="neon-type"><legend>Letter style</legend>
            <button class="neon-type-current" type="button" data-neon-action="browse-fonts" aria-haspopup="dialog" aria-controls="neon-font-dialog" aria-label="Browse letter styles">
              <span class="neon-type-current-sample" data-neon-current-sample aria-hidden="true"></span>
              <span class="neon-type-current-detail"><strong data-neon-output="font"></strong><span data-neon-browse-label>Browse styles</span></span>
              <?= $neonIcon('next') ?>
            </button>
            <div class="neon-type-nav">
              <button type="button" data-neon-action="previous-font" aria-label="Preview previous compatible style"><?= $neonIcon('previous') ?> Previous</button>
              <button class="neon-jump-preview" type="button" data-neon-action="view-sign">View sign ↑</button>
              <button type="button" data-neon-action="next-font" aria-label="Preview next compatible style">Next style <?= $neonIcon('next') ?></button>
            </div>
            <button class="neon-type-match" type="button" data-neon-action="match-font" hidden></button>
          </fieldset>
          <div class="neon-align-row"><span id="neon-align-label">Alignment</span>
            <div class="neon-segment" role="group" aria-labelledby="neon-align-label">
              <?php foreach (['left','center','right'] as $alignment): ?>
                <button type="button" data-neon-choice="align" data-value="<?= $alignment ?>" aria-label="Align <?= $alignment ?>" title="Align <?= $alignment ?>" aria-pressed="<?= $alignment === 'center' ? 'true' : 'false' ?>"><?= $neonIcon($alignment) ?></button>
              <?php endforeach; ?>
            </div>
          </div>
        </div>
      </details>
      <details class="neon-group" open>
        <summary>Cover &amp; LED colour</summary>
        <div class="neon-group-body">
          <?php foreach (['cover' => ['Silicone front cover', $neonCovers], 'color' => ['LED light', $neonColours]] as $key => [$title, $palette]): ?>
            <fieldset class="neon-colour-group"<?= $key === 'color' ? ' aria-describedby="neon-pairing-help"' : '' ?>>
              <legend><?= $title ?> <output data-neon-output="<?= $key ?>"></output></legend>
              <div class="neon-palette">
                <?php foreach ($palette as $hex => $label): ?>
                  <button type="button" class="neon-swatch" data-neon-choice="<?= $key ?>" data-value="<?= e($hex) ?>" data-label="<?= e($label) ?>" title="<?= e($label) ?>" aria-label="<?= e($label.' '.($key === 'cover' ? 'cover' : 'LED')) ?>" aria-pressed="false" style="--swatch:<?= e($hex) ?>"></button>
                <?php endforeach; ?>
              </div>
            </fieldset>
          <?php endforeach; ?>
          <div class="neon-line-colours">
            <?php for ($line = 0; $line < 4; $line++): ?>
              <label hidden>Line <?= $line + 1 ?> LED colour
                <select data-neon-line-color="<?= $line ?>" disabled>
                  <option value="">Use main colour</option>
                  <?php foreach ($neonColours as $hex=>$name): ?>
                    <option value="<?= e($hex) ?>"><?= e($name) ?></option>
                  <?php endforeach; ?>
                </select>
              </label>
            <?php endfor; ?>
          </div>
          <p class="neon-pairing-help" id="neon-pairing-help" data-neon-output="pairing" aria-live="polite"></p>
          <div class="neon-label-pair"><label for="neon-brightness">Preview brightness</label><output data-neon-output="brightness">85%</output></div>
          <input id="neon-brightness" type="range" data-neon-field="brightness" min="10" max="100" value="85" step="1">
        </div>
      </details>
      <details class="neon-group" open>
        <summary>Size &amp; mounting</summary>
        <div class="neon-group-body">
          <label for="neon-width">Lettering width</label>
          <div class="neon-unit"><input id="neon-width" type="number" min="100" max="3000" step="any" inputmode="decimal" value="600" data-neon-field="widthMm"><span>mm</span></div>
          <input type="range" aria-label="Adjust lettering width in millimetres" min="100" max="3000" step="1" value="600" data-neon-field="widthMm">
          <div class="neon-input-pair">
            <label>Plexiglass shape<select data-neon-field="boardShape"><option value="rectangle">Rectangle</option><option value="contour">Cut around lettering</option></select></label>
            <label hidden>Acrylic gap from lettering (mm)<input type="number" data-neon-field="boardGap" min="30" max="150" step="any" value="30" disabled></label>
            <label>Backboard<select data-neon-field="backing"><option value="clear">Clear acrylic</option><option value="black">Black acrylic</option><option value="none">No backboard</option></select></label>
            <label>Mounting<select data-neon-field="mount"><option value="wall">Wall mounted</option><option value="suspended">Suspended</option><option value="freestanding">Freestanding</option></select></label>
          </div>
          <details class="neon-spacing"><summary>Letter &amp; line spacing</summary>
            <div class="neon-input-pair">
              <label>Letter spacing (em)<input type="number" data-neon-field="letterSpacing" value="0" min="0" max=".3" step=".01"></label>
              <label>Line spacing<input type="number" data-neon-field="lineSpacing" value="1.25" min="1" max="2" step=".05"></label>
            </div>
          </details>
        </div>
      </details>
      <div class="neon-quote">
        <p data-neon-price>Shop quote on request</p>
        <details>
          <summary><span data-neon-request-label>Request a shop quote</span> <span aria-hidden="true">→</span></summary>
          <form method="post" action="/online-quote/neon-request" data-neon-quote-form data-private>
            <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
            <input type="hidden" name="request_id" value="<?= bin2hex(random_bytes(16)) ?>">
            <input type="hidden" name="design" data-neon-spec>
            <input type="hidden" name="intent" value="review">
            <label>Your name<input name="customer_name" autocomplete="name" required maxlength="120"></label>
            <label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
            <label>Project notes (optional)<textarea name="message" rows="2" maxlength="2000"></textarea></label>
            <button type="submit" data-neon-submit disabled>Request a shop quote</button>
            <p role="status" data-neon-response></p>
          </form>
        </details>
      </div>
    </div>
  </div>
  <dialog class="neon-font-dialog" id="neon-font-dialog" aria-labelledby="neon-font-title" data-private>
    <div class="neon-font-dialog-head">
      <h3 id="neon-font-title" tabindex="-1" autofocus>Choose a letter style</h3>
      <button type="button" class="neon-font-close" data-neon-action="close-fonts" aria-label="Close letter styles"><?= $neonIcon('close') ?></button>
    </div>
    <p class="neon-font-replacement" data-neon-font-replacement hidden></p>
    <div class="neon-font-filters">
      <label class="neon-font-search"><?= $neonIcon('search') ?><span class="neon-visually-hidden">Search letter styles</span>
        <input type="search" placeholder="Search styles" data-neon-font-search autocomplete="off">
      </label>
      <label><span class="neon-visually-hidden">Style category</span>
        <select data-neon-font-category><option value="">All categories</option></select>
      </label>
    </div>
    <p class="neon-font-count" role="status" data-neon-font-count></p>
    <div class="neon-font-list"><div class="neon-fonts" data-neon-fonts></div></div>
  </dialog>
  <dialog class="neon-expanded-proof" id="neon-expanded-proof" aria-label="Expanded sign preview"></dialog>
</section>
