(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------
     Heading reveal: split into per-character spans, let CSS blur each one
     in left to right, then put the original markup back.
     ------------------------------------------------------------------ */
  var CHAR_STAGGER = 24;   // ms, matches .reveal-char animation-delay
  var CHAR_DURATION = 700; // ms, matches .reveal-char animation

  function splitInto(target, source, counter) {
    source.childNodes.forEach(function (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            target.appendChild(document.createTextNode(part));
            return;
          }
          var word = document.createElement('span');
          word.style.whiteSpace = 'nowrap';
          Array.from(part).forEach(function (ch) {
            var c = document.createElement('span');
            c.className = 'reveal-char';
            c.style.setProperty('--i', counter.n++);
            c.textContent = ch;
            word.appendChild(c);
          });
          target.appendChild(word);
        });
      } else {
        var clone = node.cloneNode(false);
        target.appendChild(clone);
        splitInto(clone, node, counter);
      }
    });
  }

  function reveal(el) {
    if (el.classList.contains('is-revealing') || el.classList.contains('is-revealed')) return;
    if (reduceMotion) { el.classList.add('is-revealed'); return; }

    var original = el.innerHTML;
    var counter = { n: 0 };
    var holder = document.createElement('div');
    holder.innerHTML = original;

    el.setAttribute('aria-label', el.textContent);
    el.innerHTML = '';
    splitInto(el, holder, counter);
    el.querySelectorAll('.reveal-char').forEach(function (c) { c.setAttribute('aria-hidden', 'true'); });
    el.classList.add('is-revealing');

    setTimeout(function () {
      el.innerHTML = original;
      el.removeAttribute('aria-label');
      el.classList.remove('is-revealing');
      el.classList.add('is-revealed');
    }, (counter.n - 1) * CHAR_STAGGER + CHAR_DURATION + 50);
  }

  function initReveal() {
    var headings = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      headings.forEach(reveal);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          reveal(e.target);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.3 });
    headings.forEach(function (h) { io.observe(h); });
  }

  // Start once Geist is in, so the reveal never plays on the fallback face.
  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 1500); })]).then(initReveal);

  /* ------------------------------------------------------------------
     Hero feed: pointer parallax + slight push-in, a warm "flashlight"
     that follows the cursor, and a slower scroll.
     ------------------------------------------------------------------ */
  var hero = document.getElementById('hero');
  var heroImage = document.getElementById('heroImage');
  var heroLight = document.getElementById('heroLight');

  // Optional: <section class="hero" data-video="assets/coram/hero.mp4">
  // swaps the still for a looping clip (the still stays as its poster).
  if (hero && heroImage && hero.dataset.video) {
    var v = document.createElement('video');
    v.className = heroImage.className;
    v.id = 'heroImage';
    v.src = hero.dataset.video;
    v.poster = heroImage.getAttribute('src');
    v.muted = v.loop = v.autoplay = v.playsInline = true;
    v.setAttribute('playsinline', '');
    heroImage.replaceWith(v);
    heroImage = v;
    v.play().catch(function () {});
  }

  // WebGL look-around (js/hero-scene.js); the CSS parallax below is the
  // fallback when WebGL is unavailable.
  var scene = null;
  if (hero && heroImage && !reduceMotion && window.CoramHeroScene) {
    scene = window.CoramHeroScene.init(hero, heroImage, document.getElementById('heroMedia'));
  }

  if (scene) {
    hero.addEventListener('pointermove', function (e) {
      if (!scene || e.pointerType === 'touch') return;
      var r = hero.getBoundingClientRect();
      scene.point(
        (e.clientX - r.left) / r.width - 0.5,
        (e.clientY - r.top) / r.height - 0.5,
        e.clientX - r.left,
        e.clientY - r.top
      );
    });
    hero.addEventListener('pointerleave', function () { if (scene) scene.leave(); });
    window.addEventListener('scroll', function () { if (scene) scene.scroll(window.scrollY); }, { passive: true });
  }
  if (hero && heroImage && !reduceMotion) {
    if (scene) hero.addEventListener('herosceneerror', cssParallax, { once: true });
    else cssParallax();
  }

  function cssParallax() {
    scene = null;
    // max travel stays inside the 1.03 overscan (≈28px x, ≈15px y)
    var MAX_X = 16, MAX_Y = 10, ZOOM = 1.03;
    var cur = { x: 0, y: 0, s: 1 };
    var tgt = { x: 0, y: 0, s: 1 };
    var scrollY = 0;
    var running = false;

    function tick() {
      cur.x += (tgt.x - cur.x) * 0.08;
      cur.y += (tgt.y - cur.y) * 0.08;
      cur.s += (tgt.s - cur.s) * 0.06;
      var sy = Math.min(scrollY, hero.offsetHeight) * 0.25;
      heroImage.style.setProperty('--px', cur.x.toFixed(2) + 'px');
      heroImage.style.setProperty('--py', (cur.y + sy).toFixed(2) + 'px');
      heroImage.style.setProperty('--s', cur.s.toFixed(4));
      var settled = Math.abs(tgt.x - cur.x) < 0.05 && Math.abs(tgt.y - cur.y) < 0.05 && Math.abs(tgt.s - cur.s) < 0.0005;
      if (settled) {
        running = false;
        return;
      }
      requestAnimationFrame(tick);
    }
    function kick() {
      if (!running) {
        running = true;
        requestAnimationFrame(tick);
      }
    }

    hero.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var r = hero.getBoundingClientRect();
      var nx = (e.clientX - r.left) / r.width - 0.5;
      var ny = (e.clientY - r.top) / r.height - 0.5;
      tgt.x = -nx * 2 * MAX_X;
      tgt.y = -ny * 2 * MAX_Y;
      tgt.s = ZOOM;
      if (heroLight) {
        heroLight.style.setProperty('--lx', (e.clientX - r.left) + 'px');
        heroLight.style.setProperty('--ly', (e.clientY - r.top) + 'px');
        hero.classList.add('is-lit');
      }
      kick();
    });
    hero.addEventListener('pointerleave', function () {
      tgt.x = tgt.y = 0;
      tgt.s = 1;
      hero.classList.remove('is-lit');
      kick();
    });
    window.addEventListener('scroll', function () {
      scrollY = window.scrollY;
      if (scrollY < hero.offsetHeight + 100) kick();
    }, { passive: true });
  }

  /* ------------------------------------------------------------------
     Menu: the bar widens, then unfolds down to fit the panel (CSS does
     the motion; this sets the target height and toggles state).
     ------------------------------------------------------------------ */
  var nav = document.getElementById('nav');
  var toggle = document.getElementById('menuToggle');
  var panel = document.getElementById('menuPanel');
  var overlay = document.getElementById('menuOverlay');
  var closeTimer = null;

  // Lay the panel out at the open width up front, so its height is right
  // and nothing reflows while the bar is still widening.
  function setMenuHeight() {
    panel.style.width = (nav.parentElement.clientWidth - 32) + 'px';
    nav.style.setProperty('--menu-height', (72 + panel.offsetHeight) + 'px');
  }

  function openMenu() {
    clearTimeout(closeTimer);
    panel.hidden = false;
    setMenuHeight();
    void nav.offsetWidth;
    nav.classList.add('is-open');
    document.body.classList.add('menu-open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    nav.classList.remove('is-open');
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    closeTimer = setTimeout(function () { panel.hidden = true; }, 950);
  }

  if (nav && toggle && panel) {
    toggle.addEventListener('click', function () {
      nav.classList.contains('is-open') ? closeMenu() : openMenu();
    });
    if (overlay) overlay.addEventListener('click', closeMenu);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        closeMenu();
        toggle.focus();
      }
    });
    window.addEventListener('resize', function () {
      if (nav.classList.contains('is-open')) setMenuHeight();
    });
  }

  /* ------------------------------------------------------------------
     Logo windows
     ------------------------------------------------------------------ */
  var grid = document.getElementById('logoGrid');
  if (!grid) return;

  var windows = Array.from(grid.querySelectorAll('.window'));
  var fallback = grid.querySelector('[data-default]');
  var hovered = null;

  // Hover / focus: the window takes the dark "case study" state. The
  // default window (as in the design) gets it back when the pointer leaves.
  function activate(el) {
    windows.forEach(function (w) { w.classList.toggle('is-active', w === el); });
  }

  // "[VIEW CASE STUDY]" decodes left to right out of random glyphs.
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/_';
  function decode(w) {
    var el = w.querySelector('.window__cta-text');
    if (!el || reduceMotion) return;
    var text = el.dataset.text || (el.dataset.text = el.textContent);
    var start = performance.now();
    var span = 420;
    cancelAnimationFrame(el._raf);
    (function frame(now) {
      var t = now - start;
      var out = '';
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        var at = 80 + (i / text.length) * span;
        out += (t >= at || ch === ' ' || ch === '[' || ch === ']')
          ? ch
          : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      el.textContent = out;
      if (t < 80 + span) el._raf = requestAnimationFrame(frame);
    })(start);
  }

  function engage(w) {
    if (!grid.classList.contains('is-touched')) grid.classList.add('is-touched');
    if (w.classList.contains('is-active')) return;
    activate(w);
    decode(w);
  }

  windows.forEach(function (w) {
    w.addEventListener('mouseenter', function () {
      hovered = w;
      // first touch on the default window still plays the full sequence
      if (w === fallback && !grid.classList.contains('is-touched')) w.classList.remove('is-active');
      engage(w);
    });
    w.addEventListener('mouseleave', function () { hovered = null; });
    w.addEventListener('focus', function () { engage(w); });
  });

  grid.addEventListener('mouseleave', function () { activate(fallback); });
  grid.addEventListener('focusout', function (e) {
    if (!grid.contains(e.relatedTarget)) activate(fallback);
  });

  // Logo shuffle (reference video): every 3.2s, 2–3 random windows pass
  // their logos round in a cycle, each window starting 90ms after the last.
  if (reduceMotion) return;

  var INTERVAL = 3200;
  var STAGGER = 90;
  var DURATION = 500;
  var inView = true;

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
    }).observe(grid);
  }

  function currentLogo(w) {
    return w.querySelector('.logo:not(.is-above)');
  }

  function shuffle() {
    if (document.hidden || !inView) return;

    var pool = windows.filter(function (w) { return w !== hovered; });
    var count = Math.random() < 0.5 ? 2 : 3;
    var picked = [];
    while (picked.length < count && pool.length) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    if (picked.length < 2) return;

    var outgoing = picked.map(currentLogo);
    var incoming = outgoing.map(function (_, i) {
      return outgoing[(i + picked.length - 1) % picked.length].cloneNode(true);
    });

    picked.forEach(function (w, i) {
      setTimeout(function () {
        var next = incoming[i];
        next.classList.add('is-below');
        w.insertBefore(next, outgoing[i].nextSibling);
        void next.offsetWidth; // commit the start position
        next.classList.remove('is-below');
        outgoing[i].classList.add('is-above');
        setTimeout(function () { outgoing[i].remove(); }, DURATION + 50);
      }, i * STAGGER);
    });
  }

  setInterval(shuffle, INTERVAL);
})();
