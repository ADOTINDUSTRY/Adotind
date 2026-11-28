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
  const inquiryQuestions = JSON.parse(workspace.querySelector('#project-inquiry-questions').textContent);
  const cuttingPairs = JSON.parse(workspace.querySelector('#cutting-project-pairs').textContent);
  const cuttingOptions = window.QuoteCuttingOptions;
  const cuttingProject = form.elements.cutting_project;
  const cuttingMaterial = form.elements.material_id;
  const cuttingMachine = form.elements.machine_id;
  const cuttingMachineLabel = form.querySelector('[data-cutting-machine-label]');
  const cuttingStatus = form.querySelector('[data-cutting-options-status]');
  const cuttingName = form.querySelector('[data-cutting-project-name]');
  const trail = [];
  const neon = panels.find(panel => panel.dataset.projectPanel === 'neon');
  const loaded = new Map();
  let neonReady = false, loadingNeon, notice, status, retry;
  let active;

  function loadAsset(url, style = false) {
    if (loaded.has(url)) return loaded.get(url);
    const pending = new Promise((resolve, reject) => {
      const asset = document.createElement(style ? 'link' : 'script');
      if (style) { asset.rel='stylesheet'; asset.href=url; } else { asset.src=url; }
      asset.onload = resolve;
      asset.onerror = () => { asset.remove(); loaded.delete(url); reject(new Error('Neon designer asset unavailable')); };
      document.head.appendChild(asset);
    });
    loaded.set(url,pending);
    return pending;
  }

  function openNeon(focus) {
    if (!notice) {
      notice=document.createElement('section');
      notice.className='quote-card';
      status=document.createElement('p');
      status.setAttribute('role','status');
      status.tabIndex=-1;
      retry=document.createElement('button');
      retry.className='btn';
      retry.type='button';
      retry.textContent='Try again';
      retry.addEventListener('click',() => openNeon(true));
      notice.append(status,retry);
      neon.before(notice);
    }
    notice.hidden=false;
    status.textContent='Loading neon designer…';
    retry.hidden=true;
    if (focus) status.focus();
    if (!loadingNeon) {
      // Keep the font/geometry/quote/editor execution order on a slow connection.
      // A retry keeps resources which already loaded, including their listeners.
      async function loadDesigner() {
        const assets=JSON.parse(document.getElementById('neon-assets').textContent);
        const scripts = async () => { for (const url of assets.scripts) await loadAsset(url); };
        await Promise.all([loadAsset(assets.style,true),scripts()]);
      }
      loadingNeon=loadDesigner().then(() => {
        neonReady=true;
        if (active==='neon') show('neon',notice.contains(document.activeElement));
      }).catch(() => {
        loadingNeon=null;
        status.textContent='The neon designer could not load. Check your connection and try again.';
        retry.hidden=false;
      });
    }
  }

  function show(name, focus = true) {
    active = name;
    start.hidden = name !== 'start';
    picture.hidden = name !== 'picture';
    picture.open = name === 'picture';
    form.hidden = !stages.some(stage => stage.dataset.stage === name);
    back.hidden = name === 'start';
    back.textContent = name === 'result' ? 'Start another project' : '← Back';
    stages.forEach(stage => { stage.hidden = stage.dataset.stage !== name; });
    panels.forEach(panel => { panel.hidden = panel.dataset.projectPanel !== name || (panel === neon && !neonReady); });
    results.forEach(card => { card.hidden = name !== 'result'; });
    if (notice) notice.hidden=true;
    if (name === 'neon' && !neonReady) { openNeon(focus); return; }
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
    if (name === 'neon') {
      const url = new URL(location.href);
      url.searchParams.set('project','neon');
      window.history.pushState({...window.history.state, neonTrail:[...trail,active]},'',url);
    }
    trail.push(active);
    show(name);
  }

  // The server decides which combinations are shop-reviewed and suitable for
  // each project. The browser only filters that list; it never grants approval.
  function showAllowedOptions(select, allowed) {
    [...select.options].forEach(option => {
      if (!option.value) return;
      const enabled = allowed.includes(option.value);
      option.hidden = !enabled;
      option.disabled = !enabled;
    });
    if (select.value && !allowed.includes(select.value)) select.value = '';
  }
  function updateCuttingChoices() {
    const project = cuttingProject.value;
    const available = cuttingOptions ? cuttingOptions.choices(cuttingPairs, project, cuttingMaterial.value) : {materials:[], machines:[]};
    showAllowedOptions(cuttingMaterial, available.materials);
    if (!cuttingMaterial.value && available.materials.length === 1) cuttingMaterial.value = available.materials[0];
    const matches = cuttingOptions ? cuttingOptions.choices(cuttingPairs, project, cuttingMaterial.value) : {machines:[]};
    showAllowedOptions(cuttingMachine, matches.machines);
    if (!cuttingMachine.value && matches.machines.length === 1) cuttingMachine.value = matches.machines[0];
    cuttingMachineLabel.hidden = matches.machines.length <= 1;
    if (!available.materials.length) {
      cuttingStatus.textContent = 'No reviewed cutting options are available for this project yet. Please contact us for a quote.';
    } else if (!cuttingMaterial.value) {
      cuttingStatus.textContent = 'Choose your material to see the available cutting process.';
    } else if (matches.machines.length === 1) {
      cuttingStatus.textContent = 'We will use ' + cuttingMachine.selectedOptions[0].textContent + ' for this material.';
    } else {
      cuttingStatus.textContent = 'More than one reviewed process is available. Please choose one.';
    }
  }
  cuttingMaterial.addEventListener('change', updateCuttingChoices);
  function selectCuttingProject(button) {
    const id = button.dataset.quotePath;
    if (cuttingProject.value !== id) { cuttingMaterial.value = ''; cuttingMachine.value = ''; }
    cuttingProject.value = id;
    cuttingName.textContent = button.querySelector('strong').textContent.trim();
    updateCuttingChoices();
  }
  function selectProject(button, navigate = true) {
    if (!button) return;
    const workflow = button.dataset.quoteWorkflow;
    if (workflow === 'svgtrace') {
      if (navigate) window.location.assign('/online-quote/svg-trace');
      else window.location.replace('/online-quote/svg-trace');
      return;
    }
    if (!['neon', 'drawing', 'picture', 'printing', 'letters3d', 'frames', 'inquiry'].includes(workflow)) return;
    if (workflow === 'drawing') selectCuttingProject(button);
    if (workflow === 'inquiry') {
      const inquiry = panels.find(panel => panel.dataset.projectPanel === 'inquiry');
      const name = button.querySelector('strong').textContent.trim();
      inquiry.dataset.inquiryProject = button.dataset.quotePath;
      inquiry.querySelector('[data-project-inquiry-name]').textContent = name;
      inquiry.querySelector('[data-project-inquiry-service]').value = name;
      const questions = inquiryQuestions[button.dataset.quotePath] || {};
      inquiry.querySelectorAll('[data-inquiry-field]').forEach(label => {
        const question = questions[label.dataset.inquiryField];
        const input = label.querySelector('input');
        label.hidden = !Array.isArray(question);
        input.disabled = label.hidden;
        if (!label.hidden) {
          label.querySelector('[data-inquiry-label]').textContent = question[0];
          input.placeholder = question[1];
        }
      });
    }
    if (navigate && workflow === 'letters3d') {
      const url = new URL(location.href);
      url.searchParams.set('project', button.dataset.quotePath);
      window.history.replaceState(window.history.state, '', url);
    }
    if (navigate) go(workflow); else show(workflow);
  }
  start.querySelectorAll('[data-quote-path]').forEach(button => {
    if (button.matches('a[href]')) return;
    button.addEventListener('click', () => {
      if (button.dataset.quotePath === 'guide') {
        workspace.dispatchEvent(new CustomEvent('quote-assistant-request'));
        return;
      }
      selectProject(button);
    });
  });
  workspace.addEventListener('quote-assistant-navigate', event => {
    const target = event.detail?.target;
    const button = projects.find(project => project.dataset.quotePath === target);
    if (button) selectProject(button);
  });
  back.addEventListener('click', () => {
    if (active === 'letters3d') {
      const url = new URL(location.href);
      url.searchParams.delete('project');
      window.history.replaceState(window.history.state, '', url);
    }
    if (active === 'neon') {
      if (Array.isArray(window.history.state?.neonTrail)) { window.history.back(); return; }
      const url = new URL(location.href);
      if (url.searchParams.get('project') === 'neon') url.searchParams.delete('project');
      if (url.hash === '#neon') url.hash='';
      window.history.replaceState(window.history.state,'',url);
    }
    show(trail.pop() || 'start');
  });
  const search = start.querySelector('#project-search');
  const clearSearch = start.querySelector('#project-clear');
  const projectCount = start.querySelector('#project-count');
  const projectEmpty = start.querySelector('#project-empty');
  // Ignore accents when matching, so common Greek and Latin searches remain forgiving.
  const searchText = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  function filterProjects() {
    const query = searchText(search.value.trim());
    const terms = query ? query.split(/\s+/) : [];
    let count = 0;
    projects.forEach(button => {
      const text = searchText(button.textContent + ' ' + (button.dataset.keywords || ''));
      button.hidden = !terms.every(term => text.includes(term));
      if (!button.hidden) count++;
    });
    projectEmpty.hidden = count !== 0;
    if (projectCount) projectCount.textContent = count + ' ' + (count === 1 ? 'project' : 'projects') + (query ? ' found' : ' available');
    if (clearSearch) clearSearch.hidden = !search.value;
  }
  function clearProjectSearch() {
    search.value = '';
    filterProjects();
    search.focus();
  }
  search.addEventListener('input', filterProjects);
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape' && search.value) { event.preventDefault(); clearProjectSearch(); }
  });
  clearSearch?.addEventListener('click', clearProjectSearch);
  filterProjects();
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
  open.addEventListener('click', () => selectProject(projects.find(button => button.dataset.quotePath === answer.value)));
  const drawing = form.elements.vector_file;
  const contents = form.elements.drawing_contents;
  function validateDrawing() {
    const file = drawing.files[0];
    drawing.setCustomValidity(drawing.dataset.importError || (file && (!/\.(dxf|pdf)$/i.test(file.name) || file.size > 50 * 1024 * 1024)
      ? 'Choose a DXF or vector PDF up to 50 MB.' : ''));
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
  const neonEnabled = projects.some(button => button.dataset.quotePath === 'neon');
  const neonUrl = () => neonEnabled && (location.hash === '#neon' || new URLSearchParams(location.search).get('project') === 'neon');
  function restoreNeonTrail() {
    trail.length=0;
    if (Array.isArray(window.history.state?.neonTrail)) trail.push(...window.history.state.neonTrail);
  }
  window.addEventListener('popstate', () => {
    if (neonUrl()) { restoreNeonTrail(); show('neon'); }
    else if (active === 'neon') show(trail.pop() || 'start');
  });
  if (neonUrl()) restoreNeonTrail();
  const requestedProject = new URLSearchParams(location.search).get('project');
  const initialProject = projects.find(button => button.dataset.quotePath === requestedProject && requestedProject !== 'neon');
  if (initialProject) selectProject(initialProject, false);
  else show(neonUrl() ? 'neon' : (workspace.querySelector('.alert-error') && projects.some(button => button.dataset.quotePath === 'drawing') ? 'drawing' : results.length ? 'result' : 'start'), neonUrl());
  if (requestedProject && requestedProject !== 'neon' && initialProject?.dataset.quoteWorkflow !== 'letters3d') {
    const url = new URL(location.href);
    url.searchParams.delete('project');
    window.history.replaceState(window.history.state, '', url);
  }
  if (!initialProject && !neonUrl() && active === 'drawing') {
    const defaultDrawing = projects.find(button => button.dataset.quotePath === 'drawing');
    if (defaultDrawing) selectCuttingProject(defaultDrawing);
  }
})();
