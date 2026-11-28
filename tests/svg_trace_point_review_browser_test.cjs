'use strict';

// Exercise the private trace workspace on localhost, with deterministic AI suggestions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const chrome = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(file => fs.existsSync(file));
if (!chrome) {
  console.log('Skipped SVG point review browser test. Set CHROME_PATH to run it.');
  process.exit(0);
}

async function exercise() {
  const $ = id => document.getElementById(id);
  const expect = (condition, message) => { if (!condition) throw Error(message); };
  const wait = async (test, message) => {
    for (let i = 0; i < 120; i++) {
      if (test()) return;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw Error(message + ' (' + $('ed-refine-status').textContent + ')');
  };
  const coordinates = [10, 120];
  const rectangles = coordinates.map(x => '<path fill="#284777" d="M' + x + ' 10 L' + (x + 40) + ' 10 L' +
    (x + 80) + ' 10 L' + (x + 80) + ' 75 L' + x + ' 75 Z"/>');
  const source = '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="90" viewBox="0 0 220 90">' + rectangles.join('') + '</svg>';
  const image = document.createElement('canvas');
  image.width = 220; image.height = 90;
  const context = image.getContext('2d');
  context.fillStyle = 'white'; context.fillRect(0, 0, 220, 90);
  context.fillStyle = '#284777'; coordinates.forEach(x => context.fillRect(x, 10, 80, 65));
  $('img-original').src = image.toDataURL();
  $('ws').dispatchEvent(new CustomEvent('st:result', {detail:{text:source, original:$('img-original').src}}));
  // Count the two redundant midpoint nodes which remain in the actual paths.
  function midpoints(paths) {
    return Array.from(paths).filter((p, i) => {
      const commands = p.getAttribute('d').matchAll(/[ML]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g);
      return Array.from(commands).some(m => +m[1] === coordinates[i] + 40 && +m[2] === 10);
    }).length;
  }
  const editorCount = () => midpoints(document.querySelectorAll('#ed-svg .ed-path'));
  async function findSuggestions() {
    $('ed-refine-run').click();
    await wait(() => !$('ed-refine-review').hidden && !$('ed-refine-apply').disabled, 'Suggestions did not appear');
    expect(!$('trace-ai-dialog').open, 'The new-image tracing dialog must stay closed during a node review');
  }
  let saved;
  $('ws').addEventListener('st:edited', e => { saved = e.detail.text; });
  $('edit').click();
  await wait(() => !$('ed').hidden && !$('ed-refine-panel').hidden, 'Edit points did not open its review dock');
  expect($('ed-refine-scope').value === 'drawing', 'Whole drawing should be the initial scope');
  expect(editorCount() === 2, 'Both synthetic paths must start with a redundant midpoint');
  const pick = element => {
    const box = element.getBoundingClientRect();
    const pointer = {bubbles:true, button:0, pointerId:1, clientX:box.x + box.width/2, clientY:box.y + box.height/2};
    element.dispatchEvent(new PointerEvent('pointerdown',pointer));
    $('ed-svg').dispatchEvent(new PointerEvent('pointerup',pointer));
  };
  pick(document.querySelector('.ed-path'));
  pick(document.querySelector('.ed-node[data-ni="1"]'));
  const scope = $('ed-refine-scope');
  scope.value = 'point'; scope.dispatchEvent(new Event('change'));
  expect(!scope.selectedOptions[0].disabled, 'Selecting an actual node must enable the point scope');
  $('ed-refine-local').click();
  await wait(() => !$('ed-refine-review').hidden, 'Local selected-point review did not find the redundant midpoint');
  $('ed-refine-all').click();
  expect(editorCount() === 1, 'Point-scoped cleanup may change only the selected node');
  $('ed-undo').click();
  scope.value = 'drawing'; scope.dispatchEvent(new Event('change'));
  $('ed-refine-instruction').value = 'Remove unnecessary points on the straight edges.';

  await findSuggestions();
  const first = $('ed-refine-count').textContent + $('ed-refine-reason').textContent;
  $('ed-refine-next').click();
  expect(first !== $('ed-refine-count').textContent + $('ed-refine-reason').textContent, 'Next must change the active suggestion');
  $('ed-refine-prev').click();
  expect(first === $('ed-refine-count').textContent + $('ed-refine-reason').textContent, 'Previous must return to the first suggestion');
  $('ed-refine-skip').click();
  expect(editorCount() === 2, 'Reviewing and skipping must preserve the source paths');
  $('ed-refine-apply').click();
  expect(editorCount() === 1, 'Apply this should remove just one midpoint');
  $('ed-undo').click();
  expect(editorCount() === 2, 'Undo should restore the edited shape');

  await findSuggestions();
  $('ed-refine-all').click();
  expect(editorCount() === 0, 'Apply all should remove both redundant nodes');
  $('ed-undo').click();
  expect(editorCount() === 2, 'One undo should reverse both edits in the batch');
  $('ed-redo').click();
  expect(editorCount() === 0, 'One redo should restore the full batch');
  window.confirm = () => true;
  $('ed-cancel').click(); $('edit').click();
  expect(editorCount() === 2 && saved === undefined, 'Cancel must discard all uncommitted edits');

  await findSuggestions();
  $('ed-refine-all').click(); $('ed-apply').click();
  expect($('ed').hidden && !!saved, 'Done must apply the approved geometry to the trace workspace');
  const downloaded = await (await fetch($('download').href)).text();
  const exportedPaths = new DOMParser().parseFromString(downloaded, 'image/svg+xml').querySelectorAll('path');
  expect(exportedPaths.length === 2 && midpoints(exportedPaths) === 0, 'The downloadable SVG must contain both corrected paths');
}

async function run() {
  // Render the same PIN-unlocked template and script tags that production serves.
  const render = `
    require 'svg-trace/app/lib/security.php';
    require 'svg-trace/app/lib/engine.php';
    $root = realpath('svg-trace');
    $csrf = 'test-token';
    function e($s) { return htmlspecialchars($s, ENT_QUOTES); }
    $page = ['private_trace'=>true,'presets'=>StEngine::PRESETS,
      'upload'=>['max_bytes'=>8388608,'max_dimension_px'=>4096,'formats'=>[['PNG',['png'],true]]]];
    require 'app/views/pages/svg-trace.php';`;
  const template = execFileSync(process.env.PHP_BINARY || 'php', ['-n', '-r', render], {cwd:root, encoding:'utf8'});
  const start = `window.addEventListener('load', () => (${exercise})().then(() => 'OK', e => e.stack).then(body => fetch('/result', {method:'POST', body})))`;
  const html = template.replace('</body>', '<script>' + start + '</script></body>');
  const requests = [];
  let finish;
  const result = new Promise(resolve => { finish = resolve; });
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(html); return; }
      if (req.url === '/result' || req.url === '/online-quote/svg-trace/ai') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks).toString();
        if (req.url === '/result') { res.end('OK'); finish(body); return; }
        const data = JSON.parse(body);
        assert.equal(req.method, 'POST');
        assert.equal(req.headers['x-csrf-token'], 'test-token');
        assert.equal(data.mode, 'review');
        assert.match(data.image, /^\/9j\//, 'A reduced JPEG of the reference artwork accompanies the traced contours');
        assert.equal(data.contours.length, 2);
        assert.equal(new Set(data.contours.map(c => c.id)).size, 2);
        requests.push(data);
        const proposals = data.contours.map(c => ({
          id:c.id, edits:[{action:'remove',index:1,reason:'Remove the midpoint on shape ' + c.id + '.'}],
        }));
        res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({proposals})); return;
      }
      const asset = /^\/online-quote\/svg-trace\/assets\/([\w-]+\.(?:js|css))$/.exec(req.url);
      if (asset) {
        const file = path.join(root,'svg-trace/public/assets',asset[1]);
        const bytes = fs.readFileSync(file);
        res.writeHead(200, {'Content-Type':file.endsWith('.css') ? 'text/css' : 'text/javascript'}); res.end(bytes); return;
      }
      res.writeHead(404); res.end();
    } catch (error) { res.writeHead(500); res.end(); finish(error.stack); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'svg-point-review-test-'));
  const child = spawn(chrome, ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--window-size=1280,800','--user-data-dir=' + profile,'http://127.0.0.1:' + server.address().port],
    {windowsHide:true,stdio:'ignore'});
  const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
  let timer;
  try {
    const outcome = await Promise.race([result, exited.then(code => 'Chrome exited: ' + code),
      new Promise(resolve => { timer = setTimeout(() => resolve('Browser test timed out.'), 30000); })]);
    assert.equal(outcome, 'OK');
    assert.equal(requests.length, 3, 'Only explicit review requests may contact the AI service');
    console.log('In-canvas review, individual edits, batch undo/redo, cancellation and SVG download passed.');
  } finally {
    clearTimeout(timer); child.kill();
    server.closeAllConnections(); server.close();
    await exited;
    // Only remove the unique temporary Chrome profile created above.
    if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('svg-point-review-test-')) {
      await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:150});
    }
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
