<section class="page-hero">
  <div class="container">
    <p class="eyebrow"><?= e(editable_text($page, 'eyebrow', 'Industries')) ?></p>
    <h1><?= e(editable_text($page, 'heading', 'Industries We Support')) ?></h1>
    <p class="lead"><?= e(editable_text($page, 'lead', 'We provide manufacturing and branding production support for businesses, agencies and technical project teams across Cyprus.')) ?></p>
    <?php if (editable_text($page, 'hero_image_url', '') !== ''): ?>
      <div class="hero-media-card page-hero-media">
        <img src="<?= e(editable_text($page, 'hero_image_url', '')) ?>" alt="<?= e(editable_text($page, 'heading', 'Industries page image')) ?>" loading="lazy" />
      </div>
    <?php endif; ?>
  </div>
</section>

<section class="section">
  <div class="container service-grid">
    <article class="service-card"><h2>Retail and Commercial Businesses</h2><p>Storefront systems, interior branding and promotional production.</p></article>
    <article class="service-card"><h2>Restaurants and Hospitality</h2><p>Visual identity production for customer-facing spaces.</p></article>
    <article class="service-card"><h2>Corporate Offices</h2><p>Interior and exterior branded wayfinding and presentation systems.</p></article>
    <article class="service-card"><h2>Construction and Architecture</h2><p>Custom production support for built-environment visual elements.</p></article>
    <article class="service-card"><h2>Advertising Agencies</h2><p>Production execution for campaign and installation deliverables.</p></article>
    <article class="service-card"><h2>Interior Designers</h2><p>Fabricated components and branded finishes for interior concepts.</p></article>
    <article class="service-card"><h2>Industrial Customers</h2><p>Custom fabrication and process-aligned production support.</p></article>
    <article class="service-card"><h2>Retail Fit-outs</h2><p>Coordinated production for multi-element retail deployment.</p></article>
  </div>
</section>
