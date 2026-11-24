(() => {
  const workspace = document.querySelector('.quote-workspace');
  if (!workspace) return;
  const start = workspace.querySelector('.quote-start');
  const picture = workspace.querySelector('.quote-artwork');
  const form = workspace.querySelector('.quote-prototype');
  const back = workspace.querySelector('.quote-back');
  const stages = [...form.querySelectorAll('.quote-stage')];
  const results = [...workspace.querySelectorAll('.quote-result-card, .quote-booking-card')];
  const previous = {drawing: 'start', picture: 'start', material: 'drawing', parts: 'material', result: 'start'};
  let active;

  function show(name, focus = true) {
    active = name;
    start.hidden = name !== 'start';
    picture.hidden = name !== 'picture';
    picture.open = name === 'picture';
    form.hidden = !stages.some(stage => stage.dataset.stage === name);
    back.hidden = name === 'start';
    back.textContent = name === 'result' ? 'Start another project' : '← Back';
    stages.forEach(stage => { stage.hidden = stage.dataset.stage !== name; });
    results.forEach(card => { card.hidden = name !== 'result'; });
    if (focus) {
      const panel = [start, picture, ...stages, ...results].find(el => !el.hidden);
      const heading = panel?.querySelector('h2, h3');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    }
  }

  start.querySelectorAll('[data-quote-path]').forEach(button => {
    button.addEventListener('click', () => show(button.dataset.quotePath));
  });
  back.addEventListener('click', () => show(previous[active]));
  const drawing = form.elements.vector_file;
  const contents = form.elements.drawing_contents;
  function validateDrawing() {
    const file = drawing.files[0];
    drawing.setCustomValidity(file && (!/\.dxf$/i.test(file.name) || file.size > 50 * 1024 * 1024)
      ? 'Choose a DXF drawing up to 50 MB.' : '');
    contents.setCustomValidity(contents.value && contents.value !== 'single'
      ? 'Please use the contact link for a drawing review.' : '');
  }
  drawing.addEventListener('change', validateDrawing);
  contents.addEventListener('change', validateDrawing);
  function advance() {
    validateDrawing();
    const stage = stages.find(item => item.dataset.stage === active);
    for (const field of stage.querySelectorAll('input, select, textarea')) {
      if (!field.reportValidity()) return false;
    }
    const next = stage.querySelector('[data-next]');
    if (next) show(next.dataset.next);
    return !next;
  }
  form.querySelectorAll('[data-next]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', advance);
  });
  form.addEventListener('submit', event => {
    if (!advance()) event.preventDefault();
  });
  show(workspace.querySelector('.alert-error') ? 'drawing' : results.length ? 'result' : 'start', false);
})();
