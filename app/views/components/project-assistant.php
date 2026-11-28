<aside class="quote-assistant" data-quote-assistant data-csrf="<?= e(csrf_token()) ?>" data-page="<?= e((string)($page['view'] ?? 'website')) ?>" data-service="<?= e((string)($page['landing_slug'] ?? $page['service']['slug'] ?? '')) ?>" aria-label="Project assistant">
  <div class="quote-assistant-prompt" hidden role="status"><span data-assistant-prompt-text></span><button type="button" data-assistant-prompt-open>Chat with me</button><button type="button" data-assistant-dismiss aria-label="Dismiss message">×</button></div>
  <div class="quote-assistant-panel" id="quote-assistant-panel" hidden>
    <div class="quote-assistant-header">
      <span class="quote-assistant-avatar" aria-hidden="true"><img src="/public/assets/images/quote-assistant-mascot.webp" alt="" width="450" height="550" /></span>
      <div class="quote-assistant-header-title"><span class="quote-assistant-header-kicker">A DOT INDUSTRY</span><strong>A Dot Assistant</strong><small>Here to help with your project</small></div>
      <button type="button" data-assistant-close aria-label="Close assistant">×</button>
    </div>
    <div class="quote-assistant-conversation" data-assistant-messages aria-live="polite"><span class="quote-assistant-conversation-label">LET'S GET STARTED</span><p class="assistant-reply">Hi! What would you like to make? Tell me about your idea and I’ll help you find the next step.</p></div>
    <p class="quote-assistant-privacy">Messages are processed by our AI provider and saved for our team to review. Old chats are periodically removed; backup copies may be kept longer.</p>
    <form class="quote-assistant-form" data-assistant-form>
      <label class="quote-assistant-label" for="quote-assistant-input">Your message</label>
      <textarea id="quote-assistant-input" rows="2" maxlength="800" placeholder="Tell me about your project..." required data-private></textarea>
      <button type="submit" class="quote-assistant-send" data-assistant-send aria-label="Send message"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19V5m0 0L6.5 10.5M12 5l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </form>
    <p class="quote-assistant-error" data-assistant-error role="status" hidden></p>
  </div>
  <div class="quote-assistant-controls">
    <button class="quote-assistant-toggle" type="button" data-assistant-toggle aria-expanded="false" aria-controls="quote-assistant-panel" aria-label="Open project assistant">
      <span class="quote-assistant-mascot" aria-hidden="true">
        <span class="mascot-facing">
          <img class="mascot-body" src="/public/assets/images/quote-assistant-mascot.webp" alt="" width="450" height="550" />
          <img class="mascot-wave" src="/public/assets/images/quote-assistant-mascot.webp" alt="" width="450" height="550" />
        </span>
        <img class="mascot-turn-view mascot-turn-neutral" src="/public/assets/images/quote-assistant-turn-neutral.webp" alt="" width="450" height="550" />
        <img class="mascot-turn-view mascot-turn-front-quarter" src="/public/assets/images/quote-assistant-turn-front.webp" alt="" width="450" height="550" />
        <img class="mascot-turn-view mascot-turn-side" src="/public/assets/images/quote-assistant-turn-side.webp" alt="" width="450" height="550" />
        <img class="mascot-turn-view mascot-turn-rear-quarter" src="/public/assets/images/quote-assistant-turn-rear.webp" alt="" width="450" height="550" />
        <img class="mascot-turn-back" src="/public/assets/images/quote-assistant-back.webp" alt="" width="450" height="550" />
        <span class="mascot-walking">
          <img class="mascot-walk-body" src="/public/assets/images/quote-assistant-turn-rear.webp" alt="" width="450" height="550" />
          <img class="mascot-walk-left-leg" src="/public/assets/images/quote-assistant-turn-rear.webp" alt="" width="450" height="550" />
          <img class="mascot-walk-right-leg" src="/public/assets/images/quote-assistant-turn-rear.webp" alt="" width="450" height="550" />
        </span>
        <img class="mascot-sitting-down" src="/public/assets/images/quote-assistant-sitting-down.webp" alt="" width="360" height="440" />
        <img class="mascot-settling" src="/public/assets/images/quote-assistant-seated.webp" alt="" width="360" height="440" />
      </span>
    </button>
    <button class="quote-assistant-bye" type="button" data-assistant-bye aria-label="Ask the assistant to sit down">Bye</button>
    <button class="quote-assistant-chair" type="button" data-assistant-chair aria-label="Call the project assistant">
      <img class="assistant-empty-chair" src="/public/assets/images/quote-assistant-empty-chair.webp" alt="" width="360" height="440" />
      <img class="assistant-seated" src="/public/assets/images/quote-assistant-seated.webp" alt="" width="360" height="440" />
    </button>
  </div>
</aside>
