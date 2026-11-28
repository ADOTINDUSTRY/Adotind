(() => {
  const assistant = document.querySelector('[data-quote-assistant]');
  const workspace = document.querySelector('.quote-workspace');
  if (!assistant) return;
  const toggle = assistant.querySelector('[data-assistant-toggle]');
  const panel = assistant.querySelector('#quote-assistant-panel');
  const prompt = assistant.querySelector('.quote-assistant-prompt');
  const promptText = assistant.querySelector('[data-assistant-prompt-text]');
  const promptOpen = assistant.querySelector('[data-assistant-prompt-open]');
  const input = assistant.querySelector('#quote-assistant-input');
  const messages = assistant.querySelector('[data-assistant-messages]');
  const form = assistant.querySelector('[data-assistant-form]');
  const send = assistant.querySelector('[data-assistant-send]');
  const error = assistant.querySelector('[data-assistant-error]');
  const bye = assistant.querySelector('[data-assistant-bye]');
  const chair = assistant.querySelector('[data-assistant-chair]');
  const dismiss = assistant.querySelector('[data-assistant-dismiss]');
  const history = [];
  let suggested = false, timer, welcomeTimer, farewellTimer, sitTimer, pending = false;
  try { if (sessionStorage.getItem('adot_assistant_sitting') === '1') assistant.dataset.mascotState = 'sitting'; } catch (_) {}
  const labels = workspace
    ? {neon:'Open neon designer',drawing:'Open CNC cutting',picture:'Open picture preview'}
    : {neon:'Go to neon designer',drawing:'Go to cutting quote',picture:'Go to picture preview'};

  function open() {
    clearTimeout(sitTimer);
    clearTimeout(farewellTimer);
    assistant.dataset.mascotState = 'active';
    try { sessionStorage.removeItem('adot_assistant_sitting'); } catch (_) {}
    prompt.hidden = true;
    promptOpen.hidden = false;
    dismiss.hidden = false;
    clearTimeout(welcomeTimer);
    welcomeTimer = null;
    suggested = true;
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close project assistant');
    input.focus();
  }
  function close() {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open project assistant');
    toggle.focus();
  }
  toggle.addEventListener('click', () => panel.hidden ? open() : close());
  chair.addEventListener('click', open);
  bye.addEventListener('click', () => {
    clearTimeout(timer);
    clearTimeout(welcomeTimer);
    clearTimeout(sitTimer);
    clearTimeout(farewellTimer);
    suggested = true;
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open project assistant');
    prompt.dataset.mode = 'farewell';
    promptText.textContent = 'OK, when you need help, call me!';
    promptOpen.hidden = true;
    dismiss.hidden = true;
    prompt.hidden = false;
    assistant.dataset.mascotState = 'leaving';
    chair.focus({preventScroll:true});
    try { sessionStorage.setItem('adot_assistant_sitting', '1'); } catch (_) {}
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sitTimer = setTimeout(() => {
      assistant.dataset.mascotState = 'sitting';
    }, reduced ? 0 : 2300);
    farewellTimer = setTimeout(() => { if (prompt.dataset.mode === 'farewell') prompt.hidden = true; }, reduced ? 2500 : 4000);
  });
  assistant.querySelector('[data-assistant-close]').addEventListener('click', close);
  promptOpen.addEventListener('click', open);
  dismiss.addEventListener('click', () => {
    if (prompt.dataset.mode === 'help') suggested = true;
    prompt.hidden = true;
    clearTimeout(welcomeTimer);
    welcomeTimer = null;
  });
  workspace?.addEventListener('quote-assistant-request', open);

  function welcome() {
    welcomeTimer = null;
    if (assistant.dataset.mascotState === 'sitting' || assistant.dataset.mascotState === 'leaving' || suggested || !panel.hidden || document.hidden) return;
    try { if (sessionStorage.getItem('adot_assistant_welcomed') === '1') return; } catch (_) {}
    if (document.querySelector('dialog[open]')) { welcomeTimer = setTimeout(welcome, 1500); return; }
    prompt.dataset.mode = 'welcome';
    promptText.textContent = 'Hi! Welcome to A Dot Industry!';
    promptOpen.textContent = 'Chat with me';
    prompt.hidden = false;
    try { sessionStorage.setItem('adot_assistant_welcomed', '1'); } catch (_) {}
    welcomeTimer = setTimeout(() => {
      if (prompt.dataset.mode === 'welcome') prompt.hidden = true;
      welcomeTimer = null;
    }, 7000);
  }
  function maybeSuggest() {
    if (assistant.dataset.mascotState === 'sitting' || assistant.dataset.mascotState === 'leaving' || suggested || !panel.hidden || document.hidden) return;
    if (document.querySelector('dialog[open]')) { timer = setTimeout(maybeSuggest, 15000); return; }
    clearTimeout(welcomeTimer);
    welcomeTimer = null;
    const step = stage();
    const questions = {
      start: 'Not sure what to make? Do you need help choosing?',
      drawing: 'Need help getting your drawing ready?',
      material: 'Need help choosing a material?',
      parts: 'Need help with the size or quantity?',
      neon: 'Need help designing your neon sign?',
      picture: 'Need help with your picture or outline?'
    };
    prompt.dataset.mode = 'help';
    promptText.textContent = questions[step] || 'Do you need help with your project?';
    promptOpen.textContent = 'Yes, help me';
    prompt.hidden = false;
    suggested = true;
  }
  function schedule() {
    if (assistant.dataset.mascotState === 'sitting' || assistant.dataset.mascotState === 'leaving' || suggested) return;
    clearTimeout(timer);
    timer = setTimeout(maybeSuggest, 30000);
  }
  document.addEventListener('pointerdown', schedule, {passive:true});
  document.addEventListener('keydown', schedule);
  document.addEventListener('invalid', () => { if (!suggested && panel.hidden) maybeSuggest(); }, true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      if (!prompt.dataset.mode && !welcomeTimer) welcomeTimer = setTimeout(welcome, 500);
      schedule();
    }
  });
  welcomeTimer = setTimeout(welcome, 500);
  schedule();

  function stage() {
    if (!workspace) {
      const pages = ['home','about','services','service-detail','portfolio','project-detail','machinery','materials','industries','contact'];
      return assistant.dataset.page === 'online-quote' ? 'quote_locked' : pages.includes(assistant.dataset.page) ? assistant.dataset.page : 'website';
    }
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
        body:JSON.stringify({csrf:assistant.dataset.csrf, message, stage:stage(), service:assistant.dataset.service, history:history.slice(-8)})
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
          if (workspace) {
            workspace.dispatchEvent(new CustomEvent('quote-assistant-navigate', {detail:{target:data.suggestion}}));
            close();
          } else {
            location.assign('/online-quote?project=' + encodeURIComponent(data.suggestion));
          }
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
