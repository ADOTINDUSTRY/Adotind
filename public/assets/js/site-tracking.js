(() => {
    const panel = document.querySelector('[data-site-tracking]');
    if (!panel) return;
    const key = 'adotind-tracking-preference-v1';
    const sessionKey = 'adotind-tracking-session-v1';
    let mode = '';
    try { mode = localStorage.getItem(key) || ''; } catch { return; }
    const settings = panel.querySelector('details');
    settings.open = !mode;
    let session = '';
    let pageRecorded = false;
    const page = panel.dataset.siteTracking;
    const device = matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop';
    const tags = { HEADER:'header', NAV:'nav', MAIN:'main', SECTION:'section', ARTICLE:'article', FOOTER:'footer', BUTTON:'button', A:'link', FORM:'form', IMG:'image', H1:'heading', H2:'heading' };
    const blocked = 'form, input, textarea, select, [contenteditable], canvas, svg, iframe, [data-private], [data-site-tracking]';

    function send(event) {
        if (!['analytics','replay'].includes(mode)) return;
        if (!session) {
            try {
                const saved = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
                session = saved && Date.now() - saved.time < 1800000 ? saved.id : '';
                if (!session) session = [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
            } catch { return; }
        }
        try { sessionStorage.setItem(sessionKey, JSON.stringify({id:session,time:Date.now()})); } catch { return; }
        const body = JSON.stringify({session,page,device,mode,events:[event]});
        if (!navigator.sendBeacon?.('/site-tracking/events', new Blob([body], {type:'application/json'}))) {
            fetch('/site-tracking/events', {method:'POST', headers:{'Content-Type':'application/json'}, body, keepalive:true}).catch(() => {});
        }
    }

    const scale = (value, size) => Math.max(0, Math.min(10000, Math.round(value / Math.max(1, size) * 10000)));
    function frame() {
        if (mode !== 'replay') return;
        const boxes = [];
        for (const el of document.querySelectorAll('header,nav,main,section,article,footer,button,a,form,img,h1,h2')) {
            if (el.closest(blocked) && el.tagName !== 'FORM') continue;
            const rect = el.getBoundingClientRect();
            if (rect.width < 8 || rect.height < 8 || rect.bottom <= 0 || rect.top >= innerHeight) continue;
            const x = Math.max(0, rect.left), y = Math.max(0, rect.top);
            boxes.push([tags[el.tagName], scale(x, innerWidth), scale(y, innerHeight), scale(Math.min(innerWidth,rect.right)-x,innerWidth), scale(Math.min(innerHeight,rect.bottom)-y,innerHeight)]);
            if (boxes.length >= 40) break;
        }
        send({type:'layout',boxes});
    }
    function start() {
        if (!['analytics','replay'].includes(mode) || pageRecorded) return;
        pageRecorded = true;
        send({type:'page'});
        const outcome = document.querySelector('[data-tracking-outcome]')?.dataset.trackingOutcome;
        if (outcome) send({type:outcome});
        const navigation = performance.getEntriesByType('navigation')[0];
        if (navigation && navigation.responseStart > 2000) send({type:'slow_page'});
        frame();
    }
    panel.addEventListener('click', (e) => {
        const choice = e.target.closest('[data-tracking-choice]')?.dataset.trackingChoice;
        if (!choice) return;
        const previous = mode;
        mode = choice;
        try {
            localStorage.setItem(key, mode);
            if (mode === 'off') sessionStorage.removeItem(sessionKey);
        } catch { mode = ''; return; }
        if (mode === 'off') { session = ''; pageRecorded = false; }
        panel.querySelector('[role=status]').textContent = 'Preference saved.';
        if (previous !== 'replay' && pageRecorded) frame();
        start();
    });
    document.addEventListener('click', (e) => {
        if (mode !== 'replay' || !(e.target instanceof Element) || e.target.closest(blocked)) return;
        const el = e.target.closest('a,button');
        if (el) send({type:'click',tag:tags[el.tagName],x:scale(e.clientX,innerWidth),y:scale(e.clientY,innerHeight)});
    }, true);
    let scrollTimer;
    addEventListener('scroll', () => {
        if (mode !== 'replay') return;
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            send({type:'scroll',y:scale(scrollY,document.documentElement.scrollHeight-innerHeight)});
            frame();
        }, 500);
    }, {passive:true});
    document.addEventListener('change', (e) => {
        if (!(e.target instanceof HTMLInputElement) || e.target.name !== 'vector_file') return;
        const file = e.target.files?.[0];
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        const format = ['dxf','svg','pdf','png','jpeg','zip'].includes(ext) ? ext : 'other';
        const supported = e.target.accept.split(',').some(value => value.trim().toLowerCase() === '.'+ext);
        send({type:supported ? 'upload' : 'unsupported_upload',format});
    });
    document.addEventListener('submit', (e) => {
        if (e.target instanceof HTMLFormElement && new URL(e.target.action).pathname === '/online-quote/calculate') send({type:'quote_started'});
    });
    let errorSent = false;
    addEventListener('error', () => { if (!errorSent && mode && mode !== 'off') { errorSent = true; send({type:'client_error'}); } });
    start();
})();

