(() => {
  const assistant = document.querySelector('[data-quote-assistant]');
  const workspace = document.querySelector('.quote-workspace');
  if (!assistant || !workspace) return;
  const toggle = assistant.querySelector('[data-assistant-toggle]');
  const panel = assistant.querySelector('#quote-assistant-panel');
  const prompt = assistant.querySelector('.quote-assistant-prompt');
  const input = assistant.querySelector('#quote-assistant-input');
  const messages = assistant.querySelector('[data-assistant-messages]');
  const form = assistant.querySelector('[data-assistant-form]');
  const send = assistant.querySelector('[data-assistant-send]');
  const error = assistant.querySelector('[data-assistant-error]');
  const history = [];
  let suggested = false, timer, pending = false;
  const labels = {neon:'Open neon designer',drawing:'Open CNC cutting',picture:'Open picture preview'};

  function open() {
    prompt.hidden = true;
    suggested = true;
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    input.focus();
  }
  function close() {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }
  toggle.addEventListener('click', () => panel.hidden ? open() : close());
  assistant.querySelector('[data-assistant-close]').addEventListener('click', close);
  assistant.querySelector('[data-assistant-prompt-open]').addEventListener('click', open);
  assistant.querySelector('[data-assistant-dismiss]').addEventListener('click', () => { prompt.hidden = true; suggested = true; });
  workspace.addEventListener('quote-assistant-request', open);

  function maybeSuggest() {
    if (suggested || !panel.hidden || document.hidden) return;
    if (document.querySelector('dialog[open]')) { timer = setTimeout(maybeSuggest, 15000); return; }
    prompt.hidden = false;
    suggested = true;
  }
  function schedule() {
    if (suggested) return;
    clearTimeout(timer);
    timer = setTimeout(maybeSuggest, 30000);
  }
  workspace.addEventListener('pointerdown', schedule, {passive:true});
  workspace.addEventListener('keydown', schedule);
  workspace.addEventListener('invalid', () => { if (!suggested && panel.hidden) maybeSuggest(); }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  schedule();

  function stage() {
    if (!workspace.querySelector('.quote-start')?.hidden) return 'start';
    const visible = [...workspace.querySelectorAll('[data-project-panel],[data-stage]')].find(el => !el.hidden && el.getClientRects().length);
    if (visible) return visible.dataset.projectPanel || visible.dataset.stage;
    if (workspace.querySelector('.quote-artwork:not([hidden])')) return 'picture';
    return 'result';
  }
  function addMessage(text, role) {
    const p = document.createElement('p');
    p.className = role === 'user' ? 'assistant-user' : 'assistant-reply';
    p.textContent = text;
    messages.append(p);
    messages.scrollTop = messages.scrollHeight;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || pending) return;
    pending = true; send.disabled = true; error.hidden = true;
    messages.querySelectorAll('.quote-assistant-suggestion').forEach(button => button.remove());
    addMessage(message, 'user');
    input.value = '';
    try {
      const response = await fetch('/online-quote/assistant', {
        method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({csrf:assistant.dataset.csrf, message, stage:stage(), history:history.slice(-8)})
      });
      const data = await response.json();
      if (!response.ok || typeof data.answer !== 'string') throw new Error(typeof data.error === 'string' ? data.error : 'Unable to get a response.');
      addMessage(data.answer, 'model');
      history.push({role:'user',text:message},{role:'model',text:data.answer});
      if (Object.hasOwn(labels, data.suggestion)) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'quote-assistant-suggestion';
        button.textContent = labels[data.suggestion];
        button.addEventListener('click', () => {
          workspace.dispatchEvent(new CustomEvent('quote-assistant-navigate', {detail:{target:data.suggestion}}));
          close();
        });
        messages.append(button); messages.scrollTop = messages.scrollHeight;
      }
    } catch (e) {
      error.textContent = e.message || 'Unable to get a response. Please try again.';
      error.hidden = false;
      input.value = message;
    } finally { pending = false; send.disabled = false; }
  });
})();
