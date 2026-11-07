<section class="page-hero">
  <div class="container">
    <p class="eyebrow"><?= e(editable_text($page, 'eyebrow', 'Materials')) ?></p>
    <h1><?= e(editable_text($page, 'heading', 'Materials Used Across Signage and Fabrication Workflows')) ?></h1>
    <p class="lead"><?= e(editable_text($page, 'lead', 'Material selection is matched to project environment, finish requirements, and manufacturing process suitability.')) ?></p>
    <?php if (editable_text($page, 'hero_image_url', '') !== ''): ?>
      <div class="hero-media-card page-hero-media">
        <img src="<?= e(editable_text($page, 'hero_image_url', '')) ?>" alt="<?= e(editable_text($page, 'heading', 'Materials page image')) ?>" loading="lazy" />
      </div>
    <?php endif; ?>
  </div>
</section>

<section class="section">
  <div class="container service-grid">
    <article class="service-card">
      <h2>Aluminium</h2>
      <p>Used for lightweight, corrosion-resistant components and signage structures.</p>
    </article>
    <article class="service-card">
      <h2>Stainless Steel</h2>
      <p>Used where durability, clean finish and long-term performance are needed.</p>
    </article>
    <article class="service-card">
      <h2>Carbon Steel</h2>
      <p>Used for structural and fabricated components with appropriate finishing.</p>
    </article>
    <article class="service-card">
      <h2>Acrylic / Plexiglass</h2>
      <p>Used for illuminated and non-illuminated visual signage applications.</p>
    </article>
    <article class="service-card">
      <h2>ACP / Alucobond</h2>
      <p>Used for facade cladding and signage panels where flatness and finish consistency are required.</p>
    </article>
    <article class="service-card">
      <h2>PVC, Plywood, HPL, Vinyl Films</h2>
      <p>Used for interior graphics, decorative applications, routing and printed panels.</p>
    </article>
  </div>
</section>
