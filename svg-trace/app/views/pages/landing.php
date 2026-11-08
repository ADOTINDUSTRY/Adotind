<?php /** @var array $page @var array|null $user */ $base='/svg-trace'; ?>
<section class="hero-st">
  <div class="wrap">
    <p class="eyebrow-st">Free online vector tracing by A Dot Industry</p>
    <h1>Turn Any Image Into a Clean, Editable Vector.</h1>
    <p class="lead-st">Convert raster images into scalable SVG vectors with powerful tracing and editing tools. Designed for designers, sign makers, laser operators and CNC professionals.</p>
    <div class="hero-cta">
      <a class="btn btn-primary btn-lg" href="<?= $base ?>/login">Start Tracing Free</a>
      <a class="btn btn-ghost btn-lg" href="#how">How it works</a>
    </div>
    <p class="fine">Free account required · Files auto-delete after 30 days · No credit card</p>
  </div>
</section>

<section class="section-st" id="formats">
  <div class="wrap">
    <h2>Formats that fit your workflow</h2>
    <div class="cards">
      <div class="card"><h3>Upload</h3><p>PNG, JPG, BMP, WEBP up to 20&nbsp;MB and 6000&nbsp;px.</p></div>
      <div class="card"><h3>Export SVG</h3><p>Clean, layered vector paths — ready for editing anywhere.</p></div>
      <div class="card"><h3>Export PNG / PDF</h3><p>High-resolution raster and vector-accurate PDF output.</p></div>
      <div class="card"><h3>DXF for CNC</h3><p>Real geometric entities for laser and CNC workflows — no embedded bitmaps.</p></div>
    </div>
  </div>
</section>

<section class="section-st alt" id="how">
  <div class="wrap">
    <h2>How it works</h2>
    <ol class="steps">
      <li><strong>Upload your image.</strong> Logos, artwork, scanned drawings.</li>
      <li><strong>Choose a tracing mode.</strong> Full colour, black &amp; white, with preprocessing controls.</li>
      <li><strong>Review and edit.</strong> Compare against the original, adjust, simplify.</li>
      <li><strong>Export.</strong> SVG, PNG, PDF or DXF — saved to your private library for 30 days.</li>
    </ol>
  </div>
</section>

<section class="section-st">
  <div class="wrap">
    <h2>Built for production people</h2>
    <div class="cards">
      <div class="card"><h3>Sign makers</h3><p>Turn customer logos into cut-ready vectors without re-drawing.</p></div>
      <div class="card"><h3>Laser &amp; CNC</h3><p>DXF export with real geometry, open/closed path awareness.</p></div>
      <div class="card"><h3>Designers</h3><p>Fast concept vectorisation with editable, layered SVG output.</p></div>
      <div class="card"><h3>Print shops</h3><p>Scale artwork to any size without quality loss.</p></div>
    </div>
  </div>
</section>

<section class="section-st alt">
  <div class="wrap faq">
    <h2>Frequently asked questions</h2>
    <details><summary>Is it really free?</summary><p>Yes. The first release is completely free with a registered account and fair-use limits.</p></details>
    <details><summary>Who owns my files?</summary><p>You do. We never use your artwork to train AI models and never share it. Files are deleted automatically after 30 days, or immediately when you delete them.</p></details>
    <details><summary>What can I upload?</summary><p>PNG, JPG, BMP and WEBP images up to 20&nbsp;MB and 6000&nbsp;px. You must have the right to use the images you upload.</p></details>
    <details><summary>Is the DXF ready for production?</summary><p>Exports include geometry validation reports. Always verify dimensions and kerf on a test cut, as with any tooling pipeline.</p></details>
  </div>
</section>

<section class="section-st cta-st">
  <div class="wrap">
    <h2>Ready to trace?</h2>
    <a class="btn btn-primary btn-lg" href="<?= $base ?>/login">Start Tracing Free</a>
  </div>
</section>
