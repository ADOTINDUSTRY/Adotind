<?php
$errors = flash_get('form_errors', []);
$errorMessage = flash_get('form_error');
$successMessage = flash_get('form_success');
$old = flash_get('form_old', []);
$services = require __DIR__ . '/../../data/services.php';
$serviceNames = array_column($services, 'name');
$previousService = (string)($old['service_required'] ?? '');
$heroMedia = $page['hero_media'] ?? [];
?>
<?php if ($successMessage || $errorMessage): ?>
<div hidden data-tracking-outcome="<?= $successMessage ? 'contact_sent' : 'contact_error' ?>"></div>
<?php endif; ?>
<section class="page-hero">
  <div class="container">
    <p class="eyebrow">Contact & Request a Quote</p>
    <h1>Tell Us About Your Project</h1>
    <p class="lead">
      Submit your requirements and reference files to receive a tailored quote.
    </p>
    <?php if (!empty($heroMedia[0]['url'])): ?>
      <div class="hero-media-card page-hero-media">
        <img src="<?= e((string)$heroMedia[0]['url']) ?>" alt="<?= e((string)($heroMedia[0]['title'] ?? 'Contact image')) ?>" loading="lazy" />
      </div>
    <?php endif; ?>
  </div>
</section>

<section class="section">
  <div class="container two-col">
    <div data-tracking-section="direct-contact">
      <h2>Direct Contact</h2>
      <p><strong>Phone:</strong> <a href="tel:<?= e($siteConfig['phone_href']) ?>"><?= e($siteConfig['phone']) ?></a></p>
      <p><strong>Email:</strong> <a href="mailto:<?= e($siteConfig['email']) ?>"><?= e($siteConfig['email']) ?></a></p>
      <p><strong>WhatsApp / Viber:</strong> <a href="<?= e($siteConfig['whatsapp']) ?>" target="_blank" rel="noopener noreferrer"><?= e($siteConfig['phone']) ?></a></p>
      <p>
        <strong>Location:</strong>
        <a href="<?= e($siteConfig['maps_url']) ?>" target="_blank" rel="noopener noreferrer">
          <?= e($siteConfig['location_text']) ?>
        </a>
      </p>
    </div>
    <div class="service-card" data-tracking-section="inquiry-form">
      <?php if (is_string($successMessage)): ?>
        <p class="alert alert-success"><?= e($successMessage) ?></p>
      <?php endif; ?>
      <?php if (is_string($errorMessage)): ?>
        <p class="alert alert-error"><?= e($errorMessage) ?></p>
      <?php endif; ?>

      <form action="/contact/submit" method="post" enctype="multipart/form-data" class="quote-form" novalidate>
        <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>" />

        <label>Customer Name *
          <input type="text" name="customer_name" value="<?= e((string)($old['customer_name'] ?? '')) ?>" data-private data-tracking-control="customer-name" />
          <?php if (!empty($errors['customer_name'])): ?><small class="error-text"><?= e($errors['customer_name']) ?></small><?php endif; ?>
        </label>

        <label>Company Name
          <input type="text" name="company_name" value="<?= e((string)($old['company_name'] ?? '')) ?>" data-private data-tracking-control="company-name" />
        </label>

        <label>Email *
          <input type="email" name="email" value="<?= e((string)($old['email'] ?? '')) ?>" data-private data-tracking-control="contact-email" />
          <?php if (!empty($errors['email'])): ?><small class="error-text"><?= e($errors['email']) ?></small><?php endif; ?>
        </label>

        <label>Phone *
          <input type="text" name="phone" value="<?= e((string)($old['phone'] ?? '')) ?>" data-private data-tracking-control="contact-phone" />
          <?php if (!empty($errors['phone'])): ?><small class="error-text"><?= e($errors['phone']) ?></small><?php endif; ?>
        </label>

        <label>Service Required *
          <select name="service_required" data-tracking-control="required-service">
            <option value="">Select a service</option>
            <?php if ($previousService !== '' && !in_array($previousService, $serviceNames, true)): ?>
              <option value="<?= e($previousService) ?>" selected><?= e($previousService) ?></option>
            <?php endif; ?>
            <?php foreach ($services as $service): ?>
              <?php $selected = (($old['service_required'] ?? '') === $service['name']) ? 'selected' : ''; ?>
              <option value="<?= e($service['name']) ?>" <?= $selected ?>><?= e($service['name']) ?></option>
            <?php endforeach; ?>
          </select>
          <?php if (!empty($errors['service_required'])): ?><small class="error-text"><?= e($errors['service_required']) ?></small><?php endif; ?>
        </label>

        <label>Project Description *
          <textarea name="project_description" rows="5" data-private data-tracking-control="project-description"><?= e((string)($old['project_description'] ?? '')) ?></textarea>
          <?php if (!empty($errors['project_description'])): ?><small class="error-text"><?= e($errors['project_description']) ?></small><?php endif; ?>
        </label>

        <label>Dimensions
          <input type="text" name="dimensions" value="<?= e((string)($old['dimensions'] ?? '')) ?>" data-private data-tracking-control="contact-dimensions" />
        </label>

        <label>Material
          <input type="text" name="material" value="<?= e((string)($old['material'] ?? '')) ?>" data-private data-tracking-control="contact-material" />
        </label>

        <label>Quantity
          <input type="text" name="quantity" value="<?= e((string)($old['quantity'] ?? '')) ?>" data-private data-tracking-control="contact-quantity" />
        </label>

        <label>Location or mounting (optional)
          <input type="text" name="installation" value="<?= e((string)($old['installation'] ?? '')) ?>" data-private />
        </label>

        <label>Finish or other details (optional)
          <input type="text" name="finish" value="<?= e((string)($old['finish'] ?? '')) ?>" data-private />
        </label>

        <label>Upload Drawings / Reference
          <input type="file" name="project_file" accept=".pdf,.jpg,.jpeg,.png,.webp,.svg,.dxf,.dwg,.zip" data-private data-tracking-control="reference-upload" />
          <?php if (!empty($errors['project_file'])): ?><small class="error-text"><?= e($errors['project_file']) ?></small><?php endif; ?>
        </label>

        <button type="submit" class="btn" data-tracking-control="send-inquiry">Send Inquiry</button>
      </form>
    </div>
  </div>
</section>
