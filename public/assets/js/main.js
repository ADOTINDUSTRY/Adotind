(() => {
  const preloader = document.getElementById('preloader');
  if (!preloader) return;

  const hide = () => {
    preloader.classList.add('is-done');
    window.setTimeout(() => preloader.remove(), 600);
  };

  if (document.readyState === 'complete') {
    hide();
  } else {
    window.addEventListener('load', hide, { once: true });
    // Safety net: never trap the user behind the loader.
    window.setTimeout(hide, 6000);
  }
})();

(() => {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.main-nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    nav.classList.toggle('is-open', !expanded);
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

(() => {
  const form = document.getElementById('online-quote-prototype');
  if (!form) return;

  const el = {
    machine: document.getElementById('quote-machine'),
    material: document.getElementById('quote-material'),
    length: document.getElementById('quote-length'),
    width: document.getElementById('quote-width'),
    qty: document.getElementById('quote-qty'),
    complexity: document.getElementById('quote-complexity'),
    file: document.getElementById('quote-file'),
    amount: document.getElementById('quote-estimate-amount'),
    calc: document.getElementById('quote-calc'),
    wa: document.getElementById('quote-book-wa'),
    viber: document.getElementById('quote-book-viber'),
  };
  if (!el.machine || !el.material || !el.length || !el.width || !el.qty || !el.complexity || !el.amount || !el.calc || !el.wa || !el.viber) {
    return;
  }

  const machineBase = {
    co2: 0.075,
    fiber: 0.095,
    cnc: 0.065,
  };
  const materialFactor = {
    acrylic: 1.05,
    mdf: 1.0,
    steel: 1.35,
    stainless: 1.55,
    aluminium: 1.25,
    pvc: 0.92,
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const estimate = () => {
    const machine = String(el.machine.value || 'co2');
    const material = String(el.material.value || 'mdf');
    const length = clamp(num(el.length.value, 0), 0, 100000);
    const width = clamp(num(el.width.value, 0), 0, 100000);
    const qty = clamp(num(el.qty.value, 1), 1, 10000);
    const complexity = clamp(num(el.complexity.value, 1), 1, 2);
    const areaM2 = (length * width) / 1000000;
    const setupFee = machine === 'fiber' ? 24 : machine === 'cnc' ? 20 : 16;
    const unit = (machineBase[machine] ?? machineBase.co2) * length + (12 * areaM2);
    const subtotal = (setupFee + unit * (materialFactor[material] ?? 1)) * complexity * qty;
    const minJob = machine === 'fiber' ? 45 : 35;
    const total = Math.max(minJob, subtotal);
    return Math.round(total * 100) / 100;
  };

  const buildLinks = (price) => {
    const hasFile = el.file && el.file.files && el.file.files[0] ? `File: ${el.file.files[0].name}` : 'File: not attached yet';
    const msg = [
      'Hello A Dot Industry, I want to book from the Online Quote prototype.',
      `Process: ${el.machine.options[el.machine.selectedIndex]?.text || el.machine.value}`,
      `Material: ${el.material.options[el.material.selectedIndex]?.text || el.material.value}`,
      `Size: ${el.length.value} x ${el.width.value} mm`,
      `Quantity: ${el.qty.value}`,
      `Complexity: ${el.complexity.options[el.complexity.selectedIndex]?.text || el.complexity.value}`,
      `${hasFile}`,
      `Estimated testing price: €${price.toFixed(2)}`
    ].join('\n');

    const encoded = encodeURIComponent(msg);
    el.wa.href = `https://wa.me/35797840173?text=${encoded}`;
    el.viber.href = `viber://forward?text=${encoded}`;
  };

  const refresh = () => {
    const price = estimate();
    el.amount.textContent = `€${price.toFixed(2)}`;
    buildLinks(price);
  };

  el.calc.addEventListener('click', refresh);
  [el.machine, el.material, el.length, el.width, el.qty, el.complexity, el.file].forEach((field) => {
    if (!field) return;
    field.addEventListener('change', refresh);
    field.addEventListener('input', refresh);
  });
  refresh();
})();
