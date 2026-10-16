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
     Hero extras: tick line lights up near the pointer, the headline drifts
     off with a parallax as the page scrolls, buttons are magnetic.
     ------------------------------------------------------------------ */
  var ticks = document.getElementById('heroTicks');
  var headline = document.querySelector('.hero__headline');

  if (hero && ticks && !reduceMotion) {
    hero.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = ticks.getBoundingClientRect();
      var hr = hero.getBoundingClientRect();
      var near = Math.max(0.25, 1 - (e.clientY - hr.top) / 520);
      ticks.style.setProperty('--tx', (e.clientX - r.left) + 'px');
      ticks.style.setProperty('--ta', (0.85 * near).toFixed(3));
    });
    hero.addEventListener('pointerleave', function () { ticks.style.setProperty('--ta', '0'); });
  }

  if (hero && headline && !reduceMotion) {
    var scrollQueued = false;
    window.addEventListener('scroll', function () {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(function () {
        scrollQueued = false;
        var y = Math.min(window.scrollY, hero.offsetHeight);
        headline.style.translate = '0 ' + (y * 0.35).toFixed(1) + 'px';
        headline.style.opacity = Math.max(0, 1 - y / (hero.offsetHeight * 0.7)).toFixed(3);
      });
    }, { passive: true });
  }

  if (!reduceMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) * 0.18;
        var dy = (e.clientY - (r.top + r.height / 2)) * 0.3;
        dx = Math.max(-6, Math.min(6, dx));
        dy = Math.max(-4, Math.min(4, dy));
        el.style.translate = dx.toFixed(1) + 'px ' + dy.toFixed(1) + 'px';
      });
      el.addEventListener('pointerleave', function () { el.style.translate = '0px 0px'; });
    });
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

  var hoverTimer = null;

  function openMenu() {
    clearTimeout(closeTimer);
    clearTimeout(hoverTimer);
    if (nav.classList.contains('is-open')) return;
    panel.hidden = false;
    setMenuHeight();
    void nav.offsetWidth;
    nav.classList.add('is-open');
    document.body.classList.add('menu-open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    clearTimeout(hoverTimer);
    if (!nav.classList.contains('is-open')) return;
    nav.classList.remove('is-open');
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    closeTimer = setTimeout(function () { panel.hidden = true; }, 950);
  }

  if (nav && toggle && panel) {
    // Opens while the pointer is anywhere over the bar (or the open panel);
    // a short grace period on leave stops it snapping shut on the way back.
    var canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
    nav.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'mouse' || !canHover.matches) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(openMenu, 60);
    });
    nav.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse' || !canHover.matches) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(closeMenu, 220);
    });

    // Touch and keyboard still toggle with the button.
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
    nav.addEventListener('focusout', function (e) {
      if (!nav.contains(e.relatedTarget)) closeMenu();
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

  /* Dot field glow: dots near the pointer light up in the accent colour and
     a ripple runs out from a window when it is hovered. Dots sit on the
     same 8px grid as dot-field.svg (1.6px squares at 4 + 8n). */
  var field = grid.closest('.field');
  var glowCanvas = document.getElementById('fieldGlow');
  var fieldGlow = (function () {
    if (!field || !glowCanvas || reduceMotion) return { ripple: function () {} };
    var ctx = glowCanvas.getContext('2d');
    var W = 0, H = 0, dpr = 1;
    var ptr = { x: 0, y: 0, s: 0, on: false };
    var ripples = [];
    var raf = 0;

    function size() {
      W = field.clientWidth;
      H = field.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      glowCanvas.width = Math.round(W * dpr);
      glowCanvas.height = Math.round(H * dpr);
    }

    function draw(now) {
      raf = 0;
      ptr.s += ((ptr.on ? 1 : 0) - ptr.s) * 0.12;
      ripples = ripples.filter(function (r) { return now - r.t < 1600; });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (ptr.s < 0.01 && !ripples.length) return;

      var cols = Math.ceil(W / 8), rows = Math.ceil(H / 8);
      for (var j = 0; j < rows; j++) {
        var y = 4.8 + j * 8;
        for (var i = 0; i < cols; i++) {
          var x = 4.8 + i * 8;
          var I = 0;
          if (ptr.s > 0.01) {
            var dx = x - ptr.x, dy = y - ptr.y;
            I = ptr.s * Math.exp(-(dx * dx + dy * dy) / 9000);
          }
          for (var k = 0; k < ripples.length; k++) {
            var rp = ripples[k];
            var t = (now - rp.t) / 1000;
            var d = Math.sqrt((x - rp.x) * (x - rp.x) + (y - rp.y) * (y - rp.y));
            var band = (d - t * 560) / 26;
            I = Math.max(I, (1 - t / 1.6) * 0.9 * Math.exp(-band * band));
          }
          if (I < 0.04) continue;
          var sz = 1.6 + I * 1.6;
          ctx.fillStyle = 'rgba(15, 140, 110, ' + Math.min(1, I).toFixed(3) + ')';
          ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        }
      }
      kick();
    }
    function kick() { if (!raf) raf = requestAnimationFrame(draw); }

    size();
    window.addEventListener('resize', size);
    field.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = field.getBoundingClientRect();
      ptr.x = e.clientX - r.left;
      ptr.y = e.clientY - r.top;
      ptr.on = true;
      kick();
    });
    field.addEventListener('pointerleave', function () { ptr.on = false; kick(); });

    return {
      ripple: function (el) {
        var r = field.getBoundingClientRect(), b = el.getBoundingClientRect();
        ripples.push({ x: b.left - r.left + b.width / 2, y: b.top - r.top + b.height / 2, t: performance.now() });
        kick();
      }
    };
  })();

  // Entrance cascade once the field scrolls into view
  if (field && !reduceMotion && 'IntersectionObserver' in window) {
    var statement = field.closest('.statement');
    Array.from(grid.children).forEach(function (li, n) {
      li.style.setProperty('--i', (n % 5) + Math.floor(n / 5));
    });
    field.classList.add('will-reveal');
    if (statement) statement.classList.add('will-reveal');
    var revealIO = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      field.classList.add('is-in');
      if (statement) statement.classList.add('is-in');
      revealIO.disconnect();
    }, { threshold: 0.25 });
    revealIO.observe(field);
  }

  var windows = Array.from(grid.querySelectorAll('.window'));
  var fallback = grid.querySelector('[data-default]');
  var hovered = null;

  // Hover / focus: the window takes the dark "case study" state. The plate
  // sweeps in from the side the pointer entered and out towards the side it
  // left; the default window (as in the design) gets it back afterwards.
  var SHOWN = 'inset(0 0 0 0 round 4px)';
  var HIDDEN = {
    left: 'inset(0 102% 0 -2% round 4px)',
    right: 'inset(0 -2% 0 102% round 4px)',
    top: 'inset(-2% 0 102% 0 round 4px)',
    bottom: 'inset(102% 0 -2% 0 round 4px)'
  };
  var DRIFT = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };

  function sideOf(w, x, y) {
    var r = w.getBoundingClientRect();
    var dx = (x - (r.left + r.width / 2)) / r.width;
    var dy = (y - (r.top + r.height / 2)) / r.height;
    if (x == null || (dx === 0 && dy === 0)) return 'bottom';
    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom');
  }

  // keep the plate's white copy in step with the logo currently shown
  function syncPlate(w) {
    var logo = w.querySelector('.logo:not(.is-above)');
    var copy = w.querySelector('.window__plate-logo');
    if (!logo || !copy) return;
    copy.className = 'window__plate-logo' + (logo.classList.contains('logo--keep-color') ? ' logo--keep-color' : '');
    copy.innerHTML = logo.innerHTML;
    copy.querySelectorAll('img').forEach(function (i) {
      i.alt = '';
      // logos that are white-on-colour ship a separate white version
      if (i.dataset.white) i.src = i.dataset.white;
    });
    copy.querySelectorAll('[role]').forEach(function (i) { i.removeAttribute('role'); i.removeAttribute('aria-label'); });
  }

  function show(w, side) {
    var plate = w.querySelector('.window__plate');
    var copy = w.querySelector('.window__plate-logo');
    var logo = w.querySelector('.logo:not(.is-above)');
    var d = DRIFT[side];
    syncPlate(w);
    plate.style.transition = 'none';
    copy.style.transition = 'none';
    plate.style.clipPath = HIDDEN[side];
    copy.style.translate = (d[0] * -14) + 'px ' + (d[1] * -10) + 'px';
    void plate.offsetWidth;
    plate.style.transition = '';
    copy.style.transition = '';
    plate.style.clipPath = SHOWN;
    copy.style.translate = '0px 0px';
    if (logo) logo.style.translate = (d[0] * 10) + 'px ' + (d[1] * 7) + 'px';
    w.classList.add('is-active');
    decode(w);
  }

  function hide(w, side) {
    var plate = w.querySelector('.window__plate');
    var copy = w.querySelector('.window__plate-logo');
    var logo = w.querySelector('.logo:not(.is-above)');
    var d = DRIFT[side];
    plate.style.clipPath = HIDDEN[side];
    copy.style.translate = (d[0] * 14) + 'px ' + (d[1] * 10) + 'px';
    if (logo) logo.style.translate = '0px 0px';
    w.classList.remove('is-active');
  }

  var active = fallback;

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

  function engage(w, x, y) {
    grid.classList.add('is-touched');
    if (active === w) return;
    if (active) hide(active, x == null ? 'bottom' : sideOf(active, x, y));
    active = w;
    show(w, x == null ? 'bottom' : sideOf(w, x, y));
    if (x != null) fieldGlow.ripple(w);
  }

  windows.forEach(function (w) {
    w.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'mouse') return;
      hovered = w;
      // the default window replays the sweep on its first real hover
      if (w === fallback && active === w && !grid.classList.contains('is-touched')) {
        hide(w, sideOf(w, e.clientX, e.clientY));
        active = null;
      }
      engage(w, e.clientX, e.clientY);
    });
    w.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse') return;
      hovered = null;
      // leaving the grid entirely: sweep out, the default window comes back
      var to = e.relatedTarget;
      if (!to || !grid.contains(to) || !to.closest('.window')) {
        setTimeout(function () {
          if (hovered) return;
          if (active && active !== fallback) {
            hide(active, sideOf(active, e.clientX, e.clientY));
            active = fallback;
            show(fallback, 'bottom');
          }
        }, 120);
      }
    });
    w.addEventListener('focus', function () { engage(w); });
  });

  grid.addEventListener('focusout', function (e) {
    if (!grid.contains(e.relatedTarget) && active !== fallback) {
      if (active) hide(active, 'bottom');
      active = fallback;
      show(fallback, 'bottom');
    }
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

    // the window showing the case-study state stays put
    var pool = windows.filter(function (w) { return w !== hovered && w !== active; });
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
