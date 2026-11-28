<?php
$_SESSION['frame_request_keys']=array_filter($_SESSION['frame_request_keys'] ?? [],static fn($t)=>is_int($t) && $t>time()-86400);
if (count($_SESSION['frame_request_keys'])>=20) $_SESSION['frame_request_keys']=array_slice($_SESSION['frame_request_keys'],-19,null,true);
$frameKey=bin2hex(random_bytes(16));$_SESSION['frame_request_keys'][$frameKey]=time();
?>
<section class="quote-card" data-project-panel="frames" data-frame-designer data-csrf="<?= e(csrf_token()) ?>" data-request-key="<?= e($frameKey) ?>" hidden>
  <h2>Design a rectangular frame</h2>
  <p>Choose a shop-configured profile, outside width, height and quantity. The estimate covers a simple four-sided decorative/display frame with four joins; crossbars, finishes, installation and delivery need review.</p>
  <p><strong>Not assessed for structural or load-bearing use.</strong> Contact the team if the frame needs to carry a load or support people or equipment.</p>
  <div class="quote-grid-two"><div>
    <label>Frame profile<select data-frame-profile><option value="">Loading profiles…</option></select></label><p data-frame-description></p>
    <label>Outside width (mm)<input data-frame-width type="number" min="1" max="5000" step="0.1" inputmode="decimal" value="1000"></label>
    <label>Outside height (mm)<input data-frame-height type="number" min="1" max="5000" step="0.1" inputmode="decimal" value="500"></label>
    <label>Quantity<input data-frame-quantity type="number" min="1" max="1000" step="1" inputmode="numeric" value="1"></label>
    <p data-frame-status role="status">Loading frame profiles…</p><p data-frame-price hidden><strong>Estimated total: <span data-frame-total></span></strong> <small>including VAT</small></p>
  </div><div class="quote-card"><h3>Outside size preview</h3><div style="display:flex;align-items:center;justify-content:center;min-height:200px;background:#e8edf6;border-radius:10px;padding:16px"><div data-frame-preview style="width:220px;aspect-ratio:2;border:12px solid #334155;box-sizing:border-box;max-width:100%;max-height:230px"></div></div><p data-frame-dimensions>1,000 × 500 mm</p><small>Illustration only; final construction and finishing are reviewed by the shop.</small></div></div>
  <details data-frame-request hidden><summary>Send this frame request</summary><form data-frame-order class="quote-form">
    <p>This sends a request for shop review; it does not take payment.</p><label>Your name<input name="customer_name" maxlength="100" required data-private></label><label>Email<input name="email" type="email" maxlength="254" required data-private></label><label>Phone<input name="phone" type="tel" maxlength="60" required data-private></label><label>Notes (optional)<textarea name="notes" maxlength="1200" rows="3" data-private></textarea></label>
    <button type="submit" class="btn">Send frame request</button><p data-frame-order-status role="status"></p>
  </form><button type="button" class="btn" data-frame-restart hidden>Start another frame</button></details>
  <script defer src="/public/assets/js/frame-editor.js?v=<?= e((string)filemtime(__DIR__ . '/../../../public/assets/js/frame-editor.js')) ?>"></script>
</section>
