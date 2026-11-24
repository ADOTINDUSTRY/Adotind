(() => {
    const panel = document.querySelector('[data-site-tracking]');
    if (!panel) return;

    const preferenceKey = 'adotind-tracking-preference-v1';
    const sessionKey = 'adotind-tracking-session-v1';
    const settings = panel.querySelector('details');
    const status = panel.querySelector('[role=status]');
    const page = panel.dataset.siteTracking;
    const device = matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop';
    const privateArea = '[data-private], [data-site-tracking], [contenteditable]';
    const fileFields = {vector_file:'drawing', project_file:'contact_attachment'};
    const fileFormats = ['dxf','svg','pdf','png','jpeg','zip','webp','dwg'];
    const formTargets = {
        '/contact/submit':'contact_form',
        '/online-quote/updates':'quote_updates',
        '/online-quote/book':'quote_order'
    };
    const previewOutcomes = ['quote_preview_ready', 'quote_preview_error', 'quote_blocked'];
    let mode = '';
    try {
        const saved = localStorage.getItem(preferenceKey) || '';
        mode = saved === 'replay' ? 'activity' : saved;
    } catch { return; }

    settings.open = !mode;
    let pageRecorded = false;
    let depth = 0;
    let scrollTimer;
    let visibility = document.visibilityState;
    const selectedFiles = new WeakSet();

    function send(event) {
        if (mode !== 'analytics' && mode !== 'activity') return;
        const now = Date.now();
        let state;
        let newSession = false;
        try {
            state = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
            if (!state || !/^[a-f0-9]{32}$/.test(state.id) || !Number.isFinite(state.time)
                || now - state.time >= 1800000 || now < state.time) {
                state = {
                    id: [...crypto.getRandomValues(new Uint8Array(16))]
                        .map(n => n.toString(16).padStart(2, '0')).join(''),
                    seq: 0
                };
                newSession = true;
            }
            state.seq = Number.isSafeInteger(state.seq) && state.seq >= 0 ? state.seq : 0;
            const events = [];
            if (newSession && event.type !== 'page') events.push({type:'page', at:now, seq:++state.seq});
            events.push({...event, at:now, seq:++state.seq});
            state.time = now;
            sessionStorage.setItem(sessionKey, JSON.stringify(state));
            fetch('/site-tracking/events', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                credentials:'omit',
                body:JSON.stringify({session:state.id, page, device, mode, sent_at:now, events}),
                keepalive:true
            }).catch(() => {});
        } catch {
            // Tracking must not block navigation or form submission.
        }
    }

    function showPreference() {
        status.textContent = {
            activity: 'Activity tracking is on.',
            analytics: 'Basic analytics is on. You can also allow activity tracking.',
            off: 'Activity tracking is off.'
        }[mode] || '';
        panel.querySelectorAll('[data-tracking-choice]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.trackingChoice === mode));
        });
    }

    function start() {
        if ((mode !== 'analytics' && mode !== 'activity') || pageRecorded) return;
        pageRecorded = true;
        send({type:'page'});
        document.querySelectorAll('[data-tracking-outcome]').forEach(outcome => {
            send({type:outcome.dataset.trackingOutcome, reason:outcome.dataset.trackingReason || ''});
        });
        const navigation = performance.getEntriesByType('navigation')[0];
        if (navigation && navigation.responseStart > 2000) send({type:'slow_page'});
    }

    panel.addEventListener('click', (e) => {
        const choice = e.target.closest('[data-tracking-choice]')?.dataset.trackingChoice;
        if (choice !== 'off' && choice !== 'activity') return;
        try {
            localStorage.setItem(preferenceKey, choice);
            if (choice === 'off') sessionStorage.removeItem(sessionKey);
        } catch { return; }
        mode = choice;
        if (mode === 'off') {
            pageRecorded = false;
            depth = 0;
        }
        showPreference();
        start();
    });
    addEventListener('storage', (e) => {
        if (e.key !== preferenceKey && e.key !== null) return;
        const choice = e.newValue;
        mode = choice === 'replay' ? 'activity' : (choice || '');
        if (mode === 'off' || !mode) {
            try { sessionStorage.removeItem(sessionKey); } catch {}
            pageRecorded = false;
            depth = 0;
        }
        showPreference();
        start();
    });

    function clickTarget(el) {
        if (el instanceof HTMLInputElement) {
            if (el.name === 'vector_file') return 'drawing_picker';
            if (el.name === 'project_file') return 'attachment_picker';
            return '';
        }
        if (el.matches('.nav-toggle')) return 'menu';
        if (el.matches('.filter-btn')) return 'portfolio_filter';
        if (el.matches('.quote-file-guide summary')) return 'quote_file_guide';
        if (el.matches('.quote-preview-expand, .quote-preview-close')) return 'drawing_preview';
        if (el instanceof HTMLAnchorElement) {
            if (el.protocol === 'tel:') return 'phone';
            if (el.protocol === 'mailto:') return 'email';
            if (el.protocol === 'viber:') return 'viber';
            if (el.hostname === 'wa.me' || el.hostname === 'api.whatsapp.com') return 'whatsapp';
            if (el.hostname === 'maps.app.goo.gl' || el.hostname === 'maps.google.com') return 'directions';
            if (el.origin === location.origin) {
                if (el.pathname === '/online-quote') return 'quote';
                if (el.pathname === '/contact') return 'contact';
                if (el.pathname.startsWith('/services/')) return 'service';
                if (el.pathname.startsWith('/portfolio/')) return 'project';
            }
            return el.closest('nav') ? 'navigation' : 'link';
        }
        return el instanceof HTMLButtonElement && !el.form ? 'button' : '';
    }

    document.addEventListener('click', (e) => {
        if (mode !== 'activity' || !(e.target instanceof Element) || e.target.closest(privateArea)) return;
        const el = e.target.closest('a[href],button,summary,input[type=file]');
        if (!el) return;
        const target = clickTarget(el);
        if (target) send({type:'click',target});
    }, true);

    addEventListener('scroll', () => {
        if (mode !== 'activity' || depth === 100) return;
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            if (mode !== 'activity') return;
            const maxScroll = document.documentElement.scrollHeight - innerHeight;
            if (maxScroll < 1) return;
            const progress = Math.min(100, Math.floor((scrollY + 1) / maxScroll * 100));
            const milestone = Math.floor(progress / 25) * 25;
            if (milestone <= depth) return;
            depth = milestone;
            send({type:'scroll_depth',depth});
        }, 180);
    }, {passive:true});

    document.addEventListener('visibilitychange', () => {
        const previous = visibility;
        visibility = document.visibilityState;
        if (mode !== 'activity' || previous === visibility) return;
        if (visibility === 'hidden') send({type:'page_backgrounded'});
        if (visibility === 'visible') send({type:'page_resumed'});
    });

    document.addEventListener('change', (e) => {
        if (!(e.target instanceof HTMLInputElement) || e.target.type !== 'file' || e.target.closest(privateArea)) return;
        const field = Object.hasOwn(fileFields, e.target.name) ? fileFields[e.target.name] : '';
        if (!field) return;
        const file = e.target.files?.[0];
        if (!file) {
            if (selectedFiles.delete(e.target) && mode === 'activity') send({type:'upload_removed',field});
            return;
        }
        selectedFiles.add(e.target);
        const ext = file.name.match(/\.([^.]+)$/)?.[1].toLowerCase() || '';
        const normalized = ext === 'jpg' ? 'jpeg' : ext;
        const format = fileFormats.includes(normalized) ? normalized : 'other';
        const supported = e.target.accept.split(',').some(value => value.trim().toLowerCase() === '.' + ext);
        send({type:supported ? 'upload' : 'unsupported_upload',field,format});
    });

    document.addEventListener('submit', (e) => {
        if (!(e.target instanceof HTMLFormElement) || e.target.closest(privateArea)) return;
        const path = new URL(e.target.action).pathname;
        if (path === '/online-quote/calculate') {
            send({type:'quote_started'});
        } else if (mode === 'activity' && Object.hasOwn(formTargets, path)) {
            send({type:'form_submitted',target:formTargets[path]});
        }
    }, true);

    document.addEventListener('site-tracking:quote-preview', (e) => {
        if (!previewOutcomes.includes(e.detail?.type)) return;
        send({type:e.detail.type, reason:e.detail.reason || ''});
    });

    let errorSent = false;
    addEventListener('error', () => {
        if (errorSent || (mode !== 'analytics' && mode !== 'activity')) return;
        errorSent = true;
        send({type:'client_error'});
    });
    showPreference();
    start();
})();
