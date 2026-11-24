(() => {
    const panel = document.querySelector('[data-site-tracking]');
    const preferencesButton = document.querySelector('[data-tracking-preferences]');
    if (!panel || !preferencesButton) return;

    const legacyPreferenceKey = 'adotind-tracking-preference-v1';
    const preferenceKey = 'adotind-tracking-preference-v2';
    const visitorKey = 'adotind-tracking-visitor-v2';
    const visitorDate = new Intl.DateTimeFormat('en-CA', {
        timeZone:'Asia/Nicosia', year:'numeric', month:'2-digit', day:'2-digit'
    });
    const sessionKey = 'adotind-tracking-session-v1';
    const bannerTitle = panel.querySelector('h2');
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
    const destinations = {
        '/':'home', '/about':'about', '/services':'services', '/portfolio':'portfolio',
        '/machinery':'machinery', '/materials':'materials', '/industries':'industries',
        '/contact':'contact', '/online-quote':'online-quote'
    };
    const minimumScrollDistance = 8;
    const scrollPause = 180;
    const backgroundDelay = 300;
    const previewOutcomes = ['quote_preview_ready', 'quote_preview_error', 'quote_blocked'];
    function readPreference() {
        const upgraded = localStorage.getItem(preferenceKey);
        const legacy = localStorage.getItem(legacyPreferenceKey) || '';
        if (upgraded === 'off' || legacy === 'off') return {mode:'off',visitors:false};
        if (upgraded === 'activity') return {mode:'activity',visitors:true};
        return {mode:legacy === 'replay' ? 'activity' : legacy,visitors:false};
    }

    let mode = '';
    let visitors = false;
    try {
        ({mode, visitors} = readPreference());
        if (!visitors) localStorage.removeItem(visitorKey);
    } catch { return; }

    let openedFromFooter = false;
    let pageRecorded = false;
    let scrollAnchor = mode === 'activity' ? Math.max(0, scrollY) : 0;
    let pendingScroll;
    let scrollTimer;
    let visibility = document.visibilityState;
    let hiddenAt;
    let backgroundTimer;
    let backgroundRecorded = false;
    let leavingPage = false;
    const selectedFiles = new WeakSet();

    function randomId() {
        return [...crypto.getRandomValues(new Uint8Array(16))]
            .map(n => n.toString(16).padStart(2, '0')).join('');
    }

    function getDailyVisitor(now) {
        const parts = Object.fromEntries(visitorDate.formatToParts(now).map(part => [part.type, part.value]));
        const day = parts.year + '-' + parts.month + '-' + parts.day;
        let stored;
        try { stored = JSON.parse(localStorage.getItem(visitorKey) || 'null'); } catch {}
        if (stored?.day === day && /^[a-f0-9]{32}$/.test(stored.id)) return stored;
        const next = {day,id:randomId()};
        localStorage.setItem(visitorKey, JSON.stringify(next));
        return next;
    }

    function landingSource() {
        const search = new URLSearchParams(location.search);
        const taggedSources = {
            google:'google', bing:'bing', duckduckgo:'duckduckgo', yahoo:'yahoo',
            facebook:'facebook', fb:'facebook', instagram:'instagram', ig:'instagram',
            whatsapp:'whatsapp'
        };
        const tag = search.get('utm_source')?.toLowerCase();
        const tagged = Object.hasOwn(taggedSources, tag) ? taggedSources[tag] : '';
        const medium = search.get('utm_medium')?.toLowerCase();
        let referrer;
        try { referrer = document.referrer ? new URL(document.referrer) : null; } catch { referrer = null; }
        const host = referrer?.hostname.toLowerCase() || '';
        const matches = domain => host === domain || host.endsWith('.' + domain);
        let source = tagged;
        if (!source) {
            if (referrer?.origin === location.origin) return {};
            if (/(^|\.)google\.(?:com|[a-z]{2}|(?:com|co)\.[a-z]{2})$/.test(host)) source = 'google';
            else if (matches('bing.com')) source = 'bing';
            else if (matches('duckduckgo.com')) source = 'duckduckgo';
            else if (matches('yahoo.com')) source = 'yahoo';
            else if (matches('facebook.com') || matches('fb.com')) source = 'facebook';
            else if (matches('instagram.com')) source = 'instagram';
            else if (matches('whatsapp.com') || matches('wa.me')) source = 'whatsapp';
            else if (['search.brave.com','ecosia.org','yandex.com','yandex.ru','baidu.com'].some(matches)) source = 'other_search';
            else source = host ? 'referral' : 'direct';
        }
        if (['cpc','ppc','paid','paid_search','paid_social','display'].includes(medium)) return {source, medium:'paid'};
        if (medium === 'email') return {source, medium:'email'};
        if (['google','bing','duckduckgo','yahoo','other_search'].includes(source)) return {source, medium:'organic_search'};
        if (['facebook','instagram','whatsapp'].includes(source)) return {source, medium:'social'};
        return {source, medium:source === 'direct' ? 'direct' : 'referral'};
    }

    function send(event, occurredAt = Date.now(), isLanding = false) {
        if (mode !== 'analytics' && mode !== 'activity') return;
        const now = Date.now();
        let state;
        let newSession = false;
        try {
            const visitor = visitors ? getDailyVisitor(now) : null;
            state = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
            if (!state || !/^[a-f0-9]{32}$/.test(state.id) || !Number.isFinite(state.time)
                || now - state.time >= 1800000 || now < state.time
                || (state.visitorDay || '') !== (visitor?.day || '')) {
                state = {id:randomId(), seq:0, visitorDay:visitor?.day || ''};
                newSession = true;
            }
            state.seq = Number.isSafeInteger(state.seq) && state.seq >= 0 ? state.seq : 0;
            const events = [];
            if (newSession && event.type !== 'page') events.push({type:'page', at:now, seq:++state.seq});
            const acquisition = visitor && newSession && isLanding ? landingSource() : {};
            if (acquisition.source && panel.dataset.trackingPageSlug) acquisition.landing_slug = panel.dataset.trackingPageSlug;
            events.push({...event, ...acquisition, at:occurredAt, seq:++state.seq});
            state.time = now;
            sessionStorage.setItem(sessionKey, JSON.stringify(state));
            fetch('/site-tracking/events', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                credentials:'omit',
                referrerPolicy:'no-referrer',
                body:JSON.stringify({
                    session:state.id, page, device, mode, sent_at:now, events,
                    ...(visitor ? {visitor:visitor.id, visitor_day:visitor.day} : {})
                }),
                keepalive:true
            }).catch(() => {});
        } catch {
            // Tracking must not block navigation or form submission.
        }
    }

    function setBannerOpen(open, focus = false) {
        const returnFocus = !open && openedFromFooter && panel.contains(document.activeElement);
        panel.hidden = !open;
        preferencesButton.setAttribute('aria-expanded', String(open));
        openedFromFooter = open && focus;
        if (focus) bannerTitle.focus({preventScroll:true});
        if (returnFocus) preferencesButton.focus({preventScroll:true});
    }

    function countConsentChoice(choice) {
        fetch('/site-tracking/consent', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            credentials:'omit',
            referrerPolicy:'no-referrer',
            body:JSON.stringify({decision:choice === 'activity' ? 'accepted' : 'declined'}),
            keepalive:true
        }).catch(() => {});
    }

    function showPreference() {
        status.textContent = {
            activity: visitors ? 'Activity tracking and visitor analytics are on.' : 'Activity tracking is on. You can also allow visitor analytics.',
            analytics: 'Basic analytics is on. You can also allow activity tracking.',
            off: 'Activity tracking is off.'
        }[mode] || '';
        panel.querySelectorAll('[data-tracking-choice]').forEach(button => {
            const selected = button.dataset.trackingChoice === 'activity' ? visitors : mode === 'off';
            button.setAttribute('aria-pressed', String(selected));
        });
    }

    function start({restored = false, pageOnly = false} = {}) {
        if ((mode !== 'analytics' && mode !== 'activity') || pageRecorded) return;
        pageRecorded = true;
        send({type:'page'}, Date.now(), !restored);
        if (restored || pageOnly) return;
        document.querySelectorAll('[data-tracking-outcome]').forEach(outcome => {
            send({type:outcome.dataset.trackingOutcome, reason:outcome.dataset.trackingReason || ''});
        });
        const navigation = performance.getEntriesByType('navigation')[0];
        if (navigation && navigation.responseStart > 2000) send({type:'slow_page'});
    }

    function refreshPreference() {
        const previousMode = mode;
        const previousVisitors = visitors;
        try {
            ({mode, visitors} = readPreference());
            if (!visitors) localStorage.removeItem(visitorKey);
            if (mode === 'off' || !mode || previousVisitors !== visitors) sessionStorage.removeItem(sessionKey);
        } catch {
            mode = '';
            visitors = false;
        }
        if (mode !== previousMode || visitors !== previousVisitors) {
            resetScroll();
            resetBackground();
            const wasRecorded = pageRecorded;
            pageRecorded = false;
            showPreference();
            start({pageOnly:wasRecorded});
        }
    }

    preferencesButton.addEventListener('click', () => {
        const open = panel.hidden;
        setBannerOpen(open, open);
    });
    panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setBannerOpen(false);
    });
    panel.addEventListener('click', (e) => {
        const choice = e.target.closest('[data-tracking-choice]')?.dataset.trackingChoice;
        if (choice !== 'off' && choice !== 'activity') return;
        let changed;
        try {
            const previous = readPreference();
            changed = choice === 'off' ? previous.mode !== 'off' : !previous.visitors;
            if (changed) {
                localStorage.setItem(legacyPreferenceKey, choice);
                localStorage.setItem(preferenceKey, choice);
            }
        } catch {
            refreshPreference();
            status.textContent = 'Your choice could not be saved. Check your browser storage settings and try again.';
            return;
        }
        if (changed) countConsentChoice(choice);
        refreshPreference();
        setBannerOpen(false);
    });
    addEventListener('storage', (e) => {
        if (e.key !== preferenceKey && e.key !== legacyPreferenceKey && e.key !== null) return;
        const previous = mode;
        const previousVisitors = visitors;
        refreshPreference();
        if (mode !== previous || visitors !== previousVisitors) setBannerOpen(!mode);
    });

    function clickTarget(el) {
        if (el instanceof HTMLInputElement) {
            if (el.name === 'vector_file') return 'drawing_picker';
            if (el.name === 'project_file') return 'attachment_picker';
            return '';
        }
        if (el.matches('.nav-toggle')) return el.getAttribute('aria-expanded') === 'true' ? 'menu_close' : 'menu_open';
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
        return el instanceof HTMLButtonElement ? 'button' : '';
    }

    function clickDestination(el) {
        if (!(el instanceof HTMLAnchorElement) || el.origin !== location.origin) return {};
        const path = el.pathname.replace(/\/+$/, '') || '/';
        if (Object.hasOwn(destinations, path)) return {destination:destinations[path]};
        const detail = path.match(/^\/(services|portfolio)\/([a-z0-9-]{1,80})$/);
        if (!detail) return {};
        return {destination:detail[1] === 'services' ? 'service-detail' : 'project-detail', destination_slug:detail[2]};
    }

    function clickPoint(e) {
        const {innerWidth, innerHeight} = window;
        if (!(e.detail > 0 || e.pointerType) || !Number.isFinite(e.clientX)
            || !Number.isFinite(e.clientY) || innerWidth <= 0 || innerHeight <= 0) return {};
        const percent = (position, size) => Math.round(Math.max(0, Math.min(100, position / size * 100)));
        return {point_x:percent(e.clientX, innerWidth), point_y:percent(e.clientY, innerHeight)};
    }

    document.addEventListener('click', (e) => {
        if (mode !== 'activity') return;
        const origin = e.target instanceof Element ? e.target : e.target?.parentElement;
        if (!origin || origin.closest(privateArea)) return;
        flushScroll();
        const el = origin.closest('a[href],button,summary,input[type=file]');
        const target = (el && clickTarget(el)) || 'page_area';
        send({type:'click',target,...clickDestination(el),...clickPoint(e)});
    }, true);

    function resetScroll() {
        clearTimeout(scrollTimer);
        pendingScroll = undefined;
        scrollAnchor = mode === 'activity' ? Math.max(0, scrollY) : 0;
    }

    function flushScroll() {
        clearTimeout(scrollTimer);
        if (mode === 'activity' && pendingScroll) {
            const {direction, depth, at} = pendingScroll;
            send({type:'scroll_movement',direction,depth}, at);
        }
        pendingScroll = undefined;
    }

    addEventListener('scroll', () => {
        if (mode !== 'activity') return;
        const maxScroll = document.documentElement.scrollHeight - innerHeight;
        if (maxScroll < 1) return;
        const position = Math.max(0, Math.min(maxScroll, scrollY));
        const delta = position - scrollAnchor;
        if (Math.abs(delta) < minimumScrollDistance) return;
        const direction = delta > 0 ? 'down' : 'up';
        if (pendingScroll && pendingScroll.direction !== direction) flushScroll();
        scrollAnchor = position;
        pendingScroll = {direction, depth:Math.round(position / maxScroll * 100), at:Date.now()};
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(flushScroll, scrollPause);
    }, {passive:true});
    function resetBackground() {
        clearTimeout(backgroundTimer);
        hiddenAt = undefined;
        backgroundRecorded = false;
    }

    function recordBackground() {
        if (mode !== 'activity' || leavingPage || hiddenAt === undefined) return;
        send({type:'page_backgrounded'}, hiddenAt);
        hiddenAt = undefined;
        backgroundRecorded = true;
    }

    addEventListener('pagehide', () => {
        leavingPage = true;
        flushScroll();
        resetBackground();
    });
    addEventListener('pageshow', (e) => {
        if (!e.persisted) return;
        leavingPage = false;
        visibility = document.visibilityState;
        mode = '';
        visitors = false;
        try {
            ({mode, visitors} = readPreference());
            if (!visitors) localStorage.removeItem(visitorKey);
            if (mode === 'off' || !mode) sessionStorage.removeItem(sessionKey);
        } catch {}
        resetScroll();
        resetBackground();
        pageRecorded = false;
        showPreference();
        setBannerOpen(!mode);
        if (visibility === 'visible') start({restored:true});
    });

    document.addEventListener('visibilitychange', () => {
        const previous = visibility;
        visibility = document.visibilityState;
        if (leavingPage || previous === visibility) return;
        if (visibility === 'visible' && !pageRecorded) {
            start({restored:true});
            return;
        }
        if (mode !== 'activity') return;
        if (visibility === 'hidden') {
            flushScroll();
            hiddenAt = Date.now();
            // A document replacement also becomes hidden. Pagehide cancels that event.
            backgroundTimer = setTimeout(recordBackground, backgroundDelay);
        } else if (visibility === 'visible') {
            clearTimeout(backgroundTimer);
            recordBackground();
            if (backgroundRecorded) send({type:'page_resumed'});
            resetBackground();
        }
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
    preferencesButton.hidden = false;
    setBannerOpen(!mode);
    start();
})();
