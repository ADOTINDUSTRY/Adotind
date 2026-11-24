(() => {
    const panel = document.querySelector('[data-site-tracking]');
    const preferencesButton = document.querySelector('[data-tracking-preferences]');
    if (!panel || !preferencesButton) return;

    const legacyPreferenceKey = 'adotind-tracking-preference-v1';
    const preferenceKey = 'adotind-tracking-preference-v2';
    const legacyVisitorKey = 'adotind-tracking-visitor-v2';
    const consentBrowserKey = 'adotind-consent-browser-v1';
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
    const clickControls = 'a[href],button,summary,input:not([type=hidden]),select,textarea,[role=button]';
    const clickRegions = '[data-tracking-section],.site-header,.main-nav,.breadcrumbs,.site-footer,.hero,.page-hero';
    const clickTypes = ['mouse','touch','pen'];
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
    let preferenceGeneration = 0;
    try {
        ({mode, visitors} = readPreference());
        if (!visitors) localStorage.removeItem(legacyVisitorKey);
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
    let dailyVisitor;
    const selectedFiles = new WeakSet();

    const toHex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const isId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);

    function randomId() {
        return toHex(crypto.getRandomValues(new Uint8Array(16)));
    }

    function cyprusDay(now) {
        const parts = Object.fromEntries(visitorDate.formatToParts(now).map(part => [part.type, part.value]));
        return parts.year + '-' + parts.month + '-' + parts.day;
    }

    function readRecord(key) {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
    }

    function readConsentBrowser() {
        const record = readRecord(consentBrowserKey);
        return isId(record?.id) && Number.isSafeInteger(record.revision) && record.revision >= 0 ? record : null;
    }

    function withConsentBrowser(update) {
        const apply = () => {
            const stored = readConsentBrowser();
            const day = cyprusDay(Date.now());
            if (stored) {
                if (stored.legacyVisitor && stored.legacyVisitor.day !== day) {
                    delete stored.legacyVisitor;
                    localStorage.setItem(consentBrowserKey, JSON.stringify(stored));
                }
                return update(stored);
            }
            const previous = readRecord(legacyVisitorKey);
            // Preserve the previously counted browser for the rest of its current analytics day.
            const browser = {id:randomId(), revision:0};
            if (previous?.day === day && isId(previous.id)) browser.legacyVisitor = {day, id:previous.id};
            localStorage.setItem(consentBrowserKey, JSON.stringify(browser));
            localStorage.removeItem(legacyVisitorKey);
            return update(browser);
        };
        return navigator.locks ? navigator.locks.request(consentBrowserKey, apply) : Promise.resolve().then(apply);
    }

    async function scopedId(browser, purpose) {
        const input = new TextEncoder().encode(purpose + ':' + browser.id);
        const digest = await crypto.subtle.digest('SHA-256', input);
        return toHex(new Uint8Array(digest, 0, 16));
    }

    async function getDailyVisitor(now) {
        const day = cyprusDay(now);
        let stored = readConsentBrowser();
        if (!stored || (stored.legacyVisitor && stored.legacyVisitor.day !== day)) {
            stored = await withConsentBrowser(browser => browser);
        }
        if (stored.legacyVisitor?.day === day && isId(stored.legacyVisitor.id)) return stored.legacyVisitor;
        if (dailyVisitor?.day !== day || dailyVisitor?.browser !== stored.id) {
            dailyVisitor = {day, browser:stored.id, id:scopedId(stored, 'activity:' + day)};
        }
        return {day, id:await dailyVisitor.id};
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

    async function send(event, occurredAt = Date.now(), isLanding = false) {
        if (mode !== 'analytics' && mode !== 'activity') return;
        const now = Date.now();
        const generation = preferenceGeneration;
        let state;
        let newSession = false;
        try {
            const visitor = visitors ? await getDailyVisitor(now) : null;
            if (generation !== preferenceGeneration || readPreference().mode !== mode) return;
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

    async function reportConsentChoice(choice, browser) {
        const preference = await scopedId(browser, 'consent');
        await fetch('/site-tracking/consent', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            credentials:'omit',
            referrerPolicy:'no-referrer',
            body:JSON.stringify({decision:choice === 'activity' ? 'accepted' : 'declined', preference, revision:browser.revision}),
            keepalive:true
        });
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
            if (!visitors) localStorage.removeItem(legacyVisitorKey);
            if (mode === 'off' || !mode || previousVisitors !== visitors) sessionStorage.removeItem(sessionKey);
        } catch {
            mode = '';
            visitors = false;
        }
        if (mode !== previousMode || visitors !== previousVisitors) {
            preferenceGeneration++;
            dailyVisitor = undefined;
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
    panel.addEventListener('click', async (e) => {
        const choice = e.target.closest('[data-tracking-choice]')?.dataset.trackingChoice;
        if (choice !== 'off' && choice !== 'activity') return;
        let saved;
        try {
            saved = await withConsentBrowser(browser => {
                const next = {...browser, revision:Math.max(Date.now(), browser.revision + 1)};
                localStorage.setItem(consentBrowserKey, JSON.stringify(next));
                localStorage.setItem(legacyPreferenceKey, choice);
                localStorage.setItem(preferenceKey, choice);
                return next;
            });
        } catch {
            refreshPreference();
            status.textContent = 'Your choice could not be saved. Check your browser storage settings and try again.';
            return;
        }
        refreshPreference();
        setBannerOpen(false);
        reportConsentChoice(choice, saved).catch(() => {});
    });
    addEventListener('storage', (e) => {
        if (e.key !== preferenceKey && e.key !== legacyPreferenceKey && e.key !== null) return;
        const previous = mode;
        const previousVisitors = visitors;
        refreshPreference();
        if (mode !== previous || visitors !== previousVisitors) setBannerOpen(!mode);
    });

    function clickTarget(el) {
        if (el instanceof HTMLInputElement && el.type === 'file') {
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

    function clickInput(e) {
        if (clickTypes.includes(e.pointerType)) return e.pointerType;
        return e.detail > 0 ? 'mouse' : 'keyboard';
    }

    function clickPoint(e, input) {
        const {innerWidth, innerHeight} = window;
        if (input === 'keyboard' || !Number.isFinite(e.clientX)
            || !Number.isFinite(e.clientY) || innerWidth <= 0 || innerHeight <= 0) return {};
        const percent = (position, size) => Math.round(Math.max(0, Math.min(100, position / size * 100)));
        return {point_x:percent(e.clientX, innerWidth), point_y:percent(e.clientY, innerHeight)};
    }

    function clickRegion(origin) {
        const region = origin.closest(clickRegions);
        if (!region) return 'page-content';
        if (region.dataset.trackingSection) return region.dataset.trackingSection;
        if (region.matches('.main-nav')) return 'main-navigation';
        if (region.matches('.breadcrumbs')) return 'breadcrumbs';
        if (region.matches('.site-header')) return 'header';
        return region.matches('.site-footer') ? 'footer' : 'page-intro';
    }

    function clickSurface(origin) {
        if (origin.closest('canvas, .quote-preview-render, .quote-preview-dialog-content')) return 'canvas';
        if (origin.closest('img, picture, svg, video, [role=img]')) return 'image';
        if (origin.closest('h1,h2,h3,h4,h5,h6')) return 'heading';
        return origin.closest('p,li,figcaption,label,dt,dd') ? 'copy' : 'blank';
    }

    let lastClick;
    const labelForwarding = new WeakMap();

    function quickRepeat(e, el, input) {
        if (input === 'keyboard') {
            lastClick = undefined;
            return {};
        }
        const now = performance.now();
        const {clientX:x, clientY:y} = e;
        if (!lastClick || lastClick.el !== el || now - lastClick.startedAt > 2000
            || Math.hypot(x - lastClick.x, y - lastClick.y) > 24) {
            lastClick = {el, startedAt:now, x, y, count:1};
            return {};
        }
        return ++lastClick.count === 3 ? {repeat_count:3} : {};
    }

    document.addEventListener('click', (e) => {
        if (mode !== 'activity' || !e.isTrusted) return;
        const origin = e.target instanceof Element ? e.target : e.target?.parentElement;
        if (!origin || origin.closest(privateArea)) return;
        let control = origin.closest(clickControls);
        if (control) {
            const forwarded = labelForwarding.get(control);
            labelForwarding.delete(control);
            if (forwarded !== undefined && performance.now() - forwarded < 60) return;
        } else {
            control = origin.closest('label')?.control;
            if (control?.closest(privateArea)) return;
            if (control) labelForwarding.set(control, performance.now());
        }

        flushScroll();
        const input = clickInput(e);
        const target = (control && clickTarget(control)) || (control ? 'control' : 'page_area');
        const namedControl = control?.matches('.filter-btn') ? 'filter-' + control.dataset.filter
            : control?.dataset.trackingControl;
        send({
            type:'click',
            target,
            section:clickRegion(control || origin),
            ...(namedControl ? {control:namedControl} : {}),
            ...(control ? {} : {surface:clickSurface(origin)}),
            click_input:input,
            ...clickDestination(control),
            ...clickPoint(e, input),
            ...quickRepeat(e, control || origin, input)
        });
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
        lastClick = undefined;
        flushScroll();
        resetBackground();
    });
    addEventListener('pageshow', (e) => {
        if (!e.persisted) return;
        leavingPage = false;
        visibility = document.visibilityState;
        preferenceGeneration++;
        dailyVisitor = undefined;
        mode = '';
        visitors = false;
        try {
            ({mode, visitors} = readPreference());
            if (!visitors) localStorage.removeItem(legacyVisitorKey);
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
