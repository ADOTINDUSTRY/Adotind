<?php
// A fresh, session-scoped request key prevents repeated submissions from creating duplicates.
$_SESSION['print_request_keys'] = array_filter($_SESSION['print_request_keys'] ?? [], static fn($t) => is_int($t) && $t > time()-86400);
if (count($_SESSION['print_request_keys']) >= 20) $_SESSION['print_request_keys'] = array_slice($_SESSION['print_request_keys'], -19, null, true);
$printRequestKey=bin2hex(random_bytes(16)); $_SESSION['print_request_keys'][$printRequestKey]=time();
?>
<section class="quote-card" data-project-panel="printing" data-print-designer data-csrf="<?= e(csrf_token()) ?>" data-request-key="<?= e($printRequestKey) ?>" hidden>
  <h2>Design a printed graphic</h2>
  <p>Choose a configured print material and enter the finished size and quantity. The estimate covers printing and the selected lamination; artwork, installation and delivery are reviewed separately.</p>
  <div class="quote-grid-two">
    <div>
      <label>Print material<select data-print-product><option value="">Loading products…</option></select></label>
      <p data-print-description></p>
      <label>Width (mm)<input data-print-width type="number" min="1" max="5000" step="0.1" inputmode="decimal" value="500"></label>
      <label>Height (mm)<input data-print-height type="number" min="1" max="5000" step="0.1" inputmode="decimal" value="500"></label>
      <label>Quantity<input data-print-quantity type="number" min="1" max="1000" step="1" inputmode="numeric" value="1"></label>
      <label><input data-print-laminate type="checkbox" disabled> Add lamination</label>
      <label>Artwork (optional, up to 10 MB)<input data-print-artwork type="file" accept="application/pdf,image/png,image/jpeg,image/webp" data-private></label>
      <small>Images preview on this device. The selected file is sent only when you send the request; PDF previews are not shown here.</small>
      <p data-print-status role="status">Loading print products…</p>
      <p data-print-price hidden><strong>Estimated total: <span data-print-total></span></strong> <small>including VAT</small></p>
    </div>
    <div class="quote-card" aria-label="Proportional graphic preview"><h3>Size preview</h3><div style="display:flex;align-items:center;justify-content:center;min-height:200px;background:#e8edf6;border-radius:10px;padding:16px"><div data-print-preview style="width:150px;aspect-ratio:1;background-color:#1e3a77;background-size:contain;background-position:center;background-repeat:no-repeat;border:3px solid #e3b927;border-radius:3px;max-width:100%;max-height:230px"></div></div><p data-print-dimensions>500 × 500 mm</p><small>Shape and proportions only; artwork and colour are checked separately.</small></div>
  </div>
  <details data-print-request hidden><summary>Send this print request</summary>
    <form data-print-order class="quote-form">
      <p>We’ll review the artwork and details before production. This sends a request; it does not take payment.</p>
      <label>Your name<input name="customer_name" maxlength="100" required data-private></label>
      <label>Email<input name="email" type="email" maxlength="254" required data-private></label>
      <label>Phone<input name="phone" type="tel" maxlength="60" required data-private></label>
      <label>Notes (optional)<textarea name="notes" maxlength="1200" rows="3" data-private></textarea></label>
      <button type="submit" class="btn">Send print request</button><p data-print-order-status role="status"></p>
    </form>
    <button type="button" class="btn" data-print-restart hidden>Start another print</button>
  </details>
  <script defer src="/public/assets/js/print-editor.js?v=<?= e((string)filemtime(__DIR__ . '/../../../public/assets/js/print-editor.js')) ?>"></script>
</section>
