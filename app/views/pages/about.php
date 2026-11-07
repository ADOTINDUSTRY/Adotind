<section class="page-hero">
  <div class="container">
    <p class="eyebrow"><?= e(editable_text($page, 'eyebrow', 'About A Dot Industry')) ?></p>
    <h1><?= e(editable_text($page, 'heading', 'Manufacturing-Led Thinking for Custom Industrial Projects')) ?></h1>
    <p class="lead"><?= e(editable_text($page, 'lead', 'A Dot Industry Enterprises Ltd operates as a practical production partner for businesses that require technical execution, material understanding, and high-quality finish standards.')) ?></p>
    <?php if (editable_text($page, 'hero_image_url', '') !== ''): ?>
      <div class="hero-media-card page-hero-media">
        <img src="<?= e(editable_text($page, 'hero_image_url', '')) ?>" alt="<?= e(editable_text($page, 'heading', 'About page image')) ?>" loading="lazy" />
      </div>
    <?php endif; ?>
  </div>
</section>

<section class="section">
  <div class="container two-col">
    <div>
      <h2>Our Approach</h2>
      <p>
        We align design intent with real manufacturing workflows. Every project
        starts with application requirements, material behavior and production
        feasibility before fabrication begins.
      </p>
      <p>
        Our multidisciplinary capability across signage, CNC, laser, printing
        and fabrication allows coordinated delivery for complex visual and
        structural project scopes.
      </p>
    </div>
    <div>
      <h2>Quality & Precision</h2>
      <ul class="feature-list">
        <li>Material-aware production planning</li>
        <li>Process-specific fabrication methods</li>
        <li>Consistency across multi-part jobs</li>
        <li>Professional communication throughout delivery</li>
      </ul>
    </div>
  </div>
</section>

<section class="section section-dark">
  <div class="container">
    <h2>Our Commitment</h2>
    <p class="lead">
      We focus on long-term reliability, practical timelines, and quality-first
      output for every business client.
    </p>
  </div>
</section>
