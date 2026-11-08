<?php
$heroMedia = $page['hero_media'] ?? [];
$featuredMedia = $page['featured_media'] ?? [];
?>
<section class="hero">
  <div class="container hero-grid">
    <div>
      <p class="eyebrow">Industrial Manufacturing in Cyprus</p>
      <h1>Premium Signage, Precision CNC, Laser Cutting & Fabrication</h1>
      <p class="lead">
        A Dot Industry is a professional manufacturing partner for signage,
        machining and custom production projects. We combine design execution,
        technical capability and reliable delivery for business clients.
      </p>
      <div class="cta-group">
        <a href="/contact" class="btn">Request a Custom Quote</a>
        <a href="/services" class="btn btn-outline">Explore Capabilities</a>
      </div>
    </div>
    <?php if (!empty($heroMedia[0]['url'])): ?>
      <div class="hero-media-card">
        <img src="<?= e($heroMedia[0]['url']) ?>" alt="<?= e((string)($heroMedia[0]['title'] ?? 'Project image')) ?>" loading="lazy" />
      </div>
    <?php else: ?>
      <?= placeholder_html('factory', 'Project Gallery Pending', 'Upload images from /dashboard to display them here.') ?>
    <?php endif; ?>
  </div>
</section>

<section class="section section-light">
  <div class="container">
    <h2>What We Manufacture</h2>
    <p class="lead">
      We do not resell generic products. We produce custom work for each project
      through controlled workflows across design, cutting, shaping, assembly,
      printing and finishing.
    </p>
    <div class="cap-grid">
      <article>
        <h3>Sign Manufacturing</h3>
        <p>3D letters, illuminated signs, architectural signage and custom visual systems.</p>
      </article>
      <article>
        <h3>CNC Router Services</h3>
        <p>Precision cutting and machining for acrylic, wood, PVC and suitable composites.</p>
      </article>
      <article>
        <h3>Laser Cutting</h3>
        <p>Fiber laser and CO2 workflows for metal and non-metal applications.</p>
      </article>
      <article>
        <h3>Industrial Fabrication</h3>
        <p>Custom components, welded structures and manufacturing support parts.</p>
      </article>
    </div>
  </div>
</section>

<section class="section section-dark">
  <div class="container">
    <h2>Featured Services</h2>
    <div class="service-grid">
      <article class="service-card">
        <h3>Signage Systems</h3>
        <p>Indoor and outdoor branding systems for retail, hospitality and corporate spaces.</p>
      </article>
      <article class="service-card">
        <h3>CNC & Laser Production</h3>
        <p>Cutting, engraving and machining for custom projects and production batches.</p>
      </article>
      <article class="service-card">
        <h3>Large Format Printing</h3>
        <p>Professional printed graphics for vinyl, panels and promotional installations.</p>
      </article>
      <article class="service-card">
        <h3>Custom Fabrication</h3>
        <p>Bespoke manufacturing support for designers, contractors and businesses.</p>
      </article>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <h2>Featured Projects</h2>
    <div class="gallery-grid">
    <?php if ($featuredMedia !== []): ?>
      <?php foreach (array_slice($featuredMedia, 0, 3) as $item): ?>
          <figure class="gallery-item">
            <img class="gallery-photo" src="<?= e((string)$item['url']) ?>" alt="<?= e((string)($item['title'] ?? 'Project image')) ?>" loading="lazy" />
            <figcaption><?= e((string)($item['title'] ?? 'Project image')) ?></figcaption>
          </figure>
        <?php endforeach; ?>
      <?php else: ?>
        <figure class="gallery-item">
          <?= placeholder_html('sign', 'Signage Project') ?>
          <figcaption>Signage Project</figcaption>
        </figure>
        <figure class="gallery-item">
          <?= placeholder_html('cnc', 'CNC Project') ?>
          <figcaption>CNC Project</figcaption>
        </figure>
        <figure class="gallery-item">
          <?= placeholder_html('fab', 'Fabrication Project') ?>
          <figcaption>Fabrication Project</figcaption>
        </figure>
      <?php endif; ?>
    </div>
  </div>
</section>

<section class="section section-dark">
  <div class="container two-col">
    <div>
      <h2>Machinery & Technology</h2>
      <p class="lead">Our facility combines CNC, laser, printing and fabrication equipment for integrated production workflows.</p>
      <ul class="feature-list">
        <li>CNC router operations for panel cutting and engraving</li>
        <li>Fiber laser workflows for metal processing</li>
        <li>CO2 laser applications for acrylic and wood-based materials</li>
        <li>Wide-format eco-solvent printing and vinyl processing</li>
      </ul>
    </div>
    <div>
      <h2>Materials</h2>
      <ul class="feature-list">
        <li>Aluminium and stainless steel</li>
        <li>Carbon steel</li>
        <li>Acrylic / plexiglass</li>
        <li>ACP / Alucobond</li>
        <li>PVC, plywood, HPL and adhesive films</li>
      </ul>
    </div>
  </div>
</section>

<section class="section">
  <div class="container two-col">
    <div>
      <h2>Why Businesses Choose A Dot Industry</h2>
      <ul class="feature-list">
        <li>Manufacturing-focused, not resale-focused</li>
        <li>Technical planning and material-aware production</li>
        <li>Consistent quality control from design to finishing</li>
        <li>Single production partner for multi-discipline projects</li>
      </ul>
    </div>
    <div>
      <h2>Manufacturing Process</h2>
      <ol class="process-list">
        <li>Project brief and technical review</li>
        <li>Design and production planning</li>
        <li>Material preparation and manufacturing</li>
        <li>Assembly, finishing and quality checks</li>
        <li>Delivery coordination and support</li>
      </ol>
    </div>
  </div>
</section>

<section class="section section-dark">
  <div class="container">
    <h2>Industries Served</h2>
    <div class="tags">
      <span>Retail & Commercial</span>
      <span>Restaurants & Hospitality</span>
      <span>Corporate Offices</span>
      <span>Construction & Architecture</span>
      <span>Advertising Agencies</span>
      <span>Interior Designers</span>
      <span>Industrial Clients</span>
      <span>Retail Fit-outs</span>
    </div>
  </div>
</section>

<section class="section cta-band">
  <div class="container center">
    <h2>Start Your Custom Manufacturing Project</h2>
    <p class="lead">Send your requirements and our team will prepare a tailored production proposal.</p>
    <a href="/contact" class="btn">Request a Quote</a>
  </div>
</section>
