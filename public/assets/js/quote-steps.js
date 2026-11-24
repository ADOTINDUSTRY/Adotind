(() => {
  const workspace = document.querySelector('.quote-workspace');
  if (!workspace) return;
  const start = workspace.querySelector('.quote-start');
  const picture = workspace.querySelector('.quote-artwork');
  const form = workspace.querySelector('.quote-prototype');
  const back = workspace.querySelector('.quote-back');
  const stages = [...form.querySelectorAll('.quote-stage')];
  const results = [...workspace.querySelectorAll('.quote-result-card, .quote-booking-card')];
  const projects = [...start.querySelectorAll('[data-keywords]')];
  const panels = [...workspace.querySelectorAll('[data-project-panel]')];
  const history = [];
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
    panels.forEach(panel => { panel.hidden = panel.dataset.projectPanel !== name; });
    results.forEach(card => { card.hidden = name !== 'result'; });
    if (focus) {
      const panel = [start, picture, ...panels, ...stages, ...results].find(el => !el.hidden);
      const heading = panel?.querySelector('h2, h3');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    }
  }

  function go(name) {
    history.push(active);
    show(name);
  }
  start.querySelectorAll('[data-quote-path]').forEach(button => {
    button.addEventListener('click', () => go(button.dataset.quotePath));
  });
  back.addEventListener('click', () => show(history.pop() || 'start'));
  const search = start.querySelector('#project-search');
  search.addEventListener('input', () => {
    const terms = search.value.trim().toLowerCase().split(/\s+/);
    projects.forEach(button => {
      const text = (button.textContent + ' ' + button.dataset.keywords).toLowerCase();
      button.hidden = !terms.every(term => text.includes(term));
    });
    start.querySelector('#project-empty').hidden = projects.some(button => !button.hidden);
  });
  const answer = workspace.querySelector('#guide-answer');
  const open = workspace.querySelector('#guide-open');
  answer.addEventListener('change', () => {
    const project = projects.find(button => button.dataset.quotePath === answer.value);
    const response = workspace.querySelector('#guide-response');
    response.textContent = project ? project.querySelector('span').textContent : '';
    if (answer.value === 'unsure') {
      response.textContent = 'This tester supports illuminated text, cutting from a DXF, and tracing a picture. You can ';
      const link = document.createElement('a');
      link.href = '/contact';
      link.textContent = 'describe a different project to our team';
      response.append(link, '.');
    }
    open.hidden = !project;
    if (project) open.textContent = 'Open ' + project.querySelector('strong').textContent;
  });
  open.addEventListener('click', () => go(answer.value));
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
    if (next) go(next.dataset.next);
    return !next;
  }
  form.querySelectorAll('[data-next]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', advance);
  });
  form.addEventListener('submit', event => {
    if (!advance()) event.preventDefault();
  });
  const openNeon = location.hash === '#neon' || new URLSearchParams(location.search).get('project') === 'neon';
  show(openNeon ? 'neon' : workspace.querySelector('.alert-error') ? 'drawing' : results.length ? 'result' : 'start', openNeon);
})();
