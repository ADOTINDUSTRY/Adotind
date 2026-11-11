(() => {
  const preloader = document.getElementById('preloader');
  if (!preloader) return;
  const startedAt = performance.now();
  const minVisibleMs = 350;
  const navigation = performance.getEntriesByType('navigation')[0];

  const removeNow = () => {
    if (preloader.dataset.done === '1') return;
    preloader.dataset.done = '1';
    preloader.classList.add('is-done');
    window.setTimeout(() => preloader.remove(), 600);
  };
  const hide = () => {
    const wait = Math.max(0, minVisibleMs - (performance.now() - startedAt));
    window.setTimeout(removeNow, wait);
  };

  // When returning through browser back/forward cache, avoid loader flash.
  if (navigation && navigation.type === 'back_forward') {
    removeNow();
    return;
  }
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) removeNow();
  });

  if (document.readyState === 'complete') {
    hide();
  } else {
    window.addEventListener('load', hide, { once: true });
    // Safety net: never trap the user behind the loader.
    window.setTimeout(removeNow, 8000);
  }
})();

(() => {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.main-nav');
  if (!toggle || !nav) return;

  const close = () => {
    toggle.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
  };

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    nav.classList.toggle('is-open', !expanded);
  });

  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
  document.addEventListener('click', (e) => {
    if (nav.contains(e.target) || toggle.contains(e.target)) return;
    close();
  });
})();

(() => {
  const buttons = document.querySelectorAll('.filter-btn');
  const items = document.querySelectorAll('.portfolio-item');
  if (!buttons.length || !items.length) return;

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter || 'all';
      buttons.forEach((b) => b.classList.remove('is-active'));
      button.classList.add('is-active');

      items.forEach((item) => {
        const category = item.dataset.category || '';
        item.style.display = filter === 'all' || category === filter ? '' : 'none';
      });
    });
  });
})();

(() => {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const onScroll = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 12);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
})();

(() => {
  const layers = document.querySelectorAll('.hero, .page-hero, .cta-band');
  if (!layers.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    layers.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < -100 || rect.top > vh + 100) return;
      const progress = (rect.top + rect.height / 2 - vh / 2) / vh;
      el.style.setProperty('--px-stars', `${(progress * 90).toFixed(1)}px`);
      el.style.setProperty('--px-grid', `${(progress * 40).toFixed(1)}px`);
    });
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(update);
    }
  };
  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
})();

(() => {
  const targets = document.querySelectorAll(
    '.section .container > *, .page-hero .container > *, .cap-grid article, .service-card, .gallery-item, .tags span'
  );
  if (!targets.length) return;

  if (!('IntersectionObserver' in window)) {
    return;
  }

  targets.forEach((el) => el.classList.add('reveal'));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
  );

  targets.forEach((el) => observer.observe(el));
})();
