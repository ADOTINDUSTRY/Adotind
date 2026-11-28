'use strict';

// Serve the actual PIN-unlocked trace workspace on loopback to an isolated Chrome profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const chrome = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(file => fs.existsSync(file));
if (!chrome) {
  console.log('Skipped SVG trace browser test. Set CHROME_PATH to run it.');
  process.exit(0);
}

async function runTraceBrowser(exercise, handlePost) {
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
  const start = `window.addEventListener('load', () => (${exercise})().then(out => out === false ? null : 'OK', e => e.stack).then(body => body && fetch('/result', {method:'POST', body})))`;
  const html = template.replace('</body>', '<script>' + start + '</script></body>');
  let finish;
  const result = new Promise(resolve => { finish = resolve; });
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.split('?')[0] === '/') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(html); return; }
      if (req.method === 'POST') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        if (req.url === '/result') { res.end('OK'); finish(body.toString()); return; }
        const data = await handlePost(req, body);
        res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify(data)); return;
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'svg-trace-browser-test-'));
  const child = spawn(chrome, ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--disable-popup-blocking','--window-size=1280,800','--user-data-dir=' + profile,'http://127.0.0.1:' + server.address().port],
    {windowsHide:true,stdio:'ignore'});
  const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
  let timer;
  try {
    const outcome = await Promise.race([result, exited.then(code => 'Chrome exited: ' + code),
      new Promise(resolve => { timer = setTimeout(() => resolve('Browser test timed out.'), 30000); })]);
    assert.equal(outcome, 'OK');
  } finally {
    clearTimeout(timer); child.kill();
    server.closeAllConnections(); server.close();
    await exited;
    // Only remove the unique temporary Chrome profile created above.
    if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('svg-trace-browser-test-')) {
      await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:6,retryDelay:150});
    }
  }
}
module.exports = {runTraceBrowser};
