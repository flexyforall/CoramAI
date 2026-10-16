// Hero "server room" scene — WebGL look-around modelled on the EDOLUS
// reference recordings:
//   - the camera turns against the pointer: the whole frame drifts (about
//     ±2.5% of the width, ±3% of the height), the racks at the edges a
//     little further than the far doorway, and it eases in with ~0.5s lag;
//   - a warm light lands on the wet floor where the pointer is — a flat,
//     perspective-squashed pool that grows towards the camera and lights the
//     reflections; pointing at the racks or ceiling puts it out;
//   - lights run along the rack LED rows towards the doorway (about 3.6
//     pulses a second per light, spaced with the perspective), and the
//     glow in the light cone breathes ±6% on a 2s cycle;
//   - scrolling away dollies the camera into the corridor.
//
// At rest (pointer away, no scroll) the frame matches the Figma crop exactly.
(function () {
  'use strict';

  // Figma crop of the 3456×1990 still in the 1440×812 hero: w 130.83%,
  // centred, image centre 269.3px from the top (see .hero__image in CSS).
  var IMG_W = 3456, IMG_H = 1990;
  var CROP_W = 1.3083, CROP_MIN_W = 1883.95, ANCHOR_Y = 269.3;

  // Scene landmarks in image UV (measured on the Figma frame)
  var VP_V = 0.537;      // vanishing point / doorway (u = 0.5)
  var FLOOR_V = 0.6;     // where the floor meets the racks

  // Camera travel and easing (measured on the reference recording)
  var TURN_X = 0.025, TURN_Y = 0.03;  // fraction of hero width / height
  var EASE_LOOK = 0.5, EASE_LIGHT = 0.12, EASE_LIT = 0.3; // seconds

  var VERT = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';

  var FRAG = [
    'precision highp float;',
    'uniform sampler2D uTex;',
    'uniform vec2 uRes;',        // canvas size, device px
    'uniform float uDpr;',
    'uniform vec4 uRect;',       // image rect in CSS px: x, y, w, h
    'uniform vec2 uShift;',      // camera turn: content offset, CSS px
    'uniform float uZoom;',
    'uniform float uTime;',
    'uniform vec2 uLight;',      // floor light centre, CSS px
    'uniform float uLightR;',    // its horizontal radius, CSS px
    'uniform float uLit;',
    '',
    'void main() {',
    '  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;',
    '  vec2 uv = (css - uRect.xy) / uRect.zw;',
    '  vec2 vp = vec2(0.5, ' + VP_V.toFixed(3) + ');',
    '  uv = vp + (uv - vp) / uZoom;',
    '',
    '  // light cone mask (apex above the frame, base at the floor)',
    '  float coneW = max(0.0, (uv.y * 1084.8 - 25.0) * 0.414 / 1883.95);',
    '  float cone = (1.0 - smoothstep(0.57, 0.61, uv.y))',
    '             * (1.0 - smoothstep(coneW * 0.9, coneW * 1.12 + 0.004, abs(uv.x - 0.5)));',
    '',
    '  // camera turn: everything drifts, the near edges slightly more',
    '  vec2 d = uv - vp;',
    '  float t = max(abs(d.x) / 0.5, abs(d.y) / 0.46);',
    '  float depth = 0.85 + 0.3 * smoothstep(0.05, 1.0, t);',
    '  uv -= uShift * depth / uRect.zw;',
    '  uv = clamp(uv, vec2(0.0005), vec2(0.9995));',
    '',
    '  vec3 c = texture2D(uTex, uv).rgb;',
    '  float floorM = smoothstep(' + (FLOOR_V - 0.015).toFixed(3) + ', ' + (FLOOR_V + 0.04).toFixed(3) + ', uv.y);',
    '',
    '  // light cone glow breathes: ±6% on a 2s cycle',
    '  c *= 1.0 + cone * 0.06 * cos(uTime * 3.14159);',
    '',
    '  // rack LEDs: lights run along each row towards the doorway. Depth',
    '  // along a rack wall goes as 1/|u - 0.5|, so the pulses bunch up and',
    '  // slow down with the perspective, like the reference.',
    '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
    '  float white = 1.0 - smoothstep(0.25, 0.6, (c.r - c.b) / (l + 0.01));',
    '  float led = smoothstep(0.16, 0.38, l) * white * (1.0 - cone) * (1.0 - floorM);',
    '  float z = 0.12 / max(abs(uv.x - 0.5), 0.03);',
    '  float run = 0.5 + 0.5 * sin((z / 0.0143 - uTime * 3.6) * 6.28318);',
    '  float pulse = smoothstep(0.45, 1.0, run);',
    '  c *= mix(1.0, mix(0.22, 1.4, pulse), led);',
    '',
    '  // warm pool of light on the floor under the pointer',
    '  vec2 lp = (css - uLight) / vec2(uLightR, uLightR * 0.42);',
    '  float fl = exp(-dot(lp, lp) * 1.6) * uLit * floorM;',
    '  c = c * (1.0 + fl * 3.2) + vec3(1.0, 0.84, 0.6) * fl * 0.07;',
    '',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[hero-scene]', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  // Pages opened from disk (file://) can't hand <img> pixels to WebGL; the
  // same still ships inlined in js/hero-texture.js for that case.
  function loadInlineTexture(done) {
    function fromData() {
      var img = new Image();
      img.onload = function () { done(img); };
      img.onerror = function () { done(null); };
      img.src = window.CORAM_HERO_TEXTURE;
    }
    if (window.CORAM_HERO_TEXTURE) return fromData();
    var s = document.createElement('script');
    s.src = 'js/hero-texture.js';
    s.onload = function () { window.CORAM_HERO_TEXTURE ? fromData() : done(null); };
    s.onerror = function () { done(null); };
    document.head.appendChild(s);
  }

  function init(hero, source, mount) {
    var canvas = document.createElement('canvas');
    canvas.className = 'hero__canvas';
    var gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) return null;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var u = {};
    ['uTex', 'uRes', 'uDpr', 'uRect', 'uShift', 'uZoom', 'uTime', 'uLight', 'uLightR', 'uLit']
      .forEach(function (n) { u[n] = gl.getUniformLocation(prog, n); });

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(u.uTex, 0);

    var isVideo = source.tagName === 'VIDEO';
    var ready = false;

    // Stills are pre-scaled to the size they are drawn at with the 2D
    // canvas' high-quality filter — WebGL1 has no mipmaps for NPOT textures,
    // and sampling the 3456px original down directly would shimmer.
    var scaler = isVideo ? null : document.createElement('canvas');
    var scaledW = 0;
    function upload(targetW) {
      try {
        if (!scaler) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
          return true;
        }
        var w = Math.min(IMG_W, Math.round(targetW));
        if (Math.abs(w - scaledW) < 2) return true;
        scaler.width = w;
        scaler.height = Math.round(w * IMG_H / IMG_W);
        var ctx = scaler.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, 0, 0, scaler.width, scaler.height);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, scaler);
        scaledW = w;
        return true;
      } catch (e) {
        scaledW = 0;
        return false;
      }
    }
    function drawnWidth() {
      return Math.max(CROP_W * hero.clientWidth, CROP_MIN_W) * Math.min(window.devicePixelRatio || 1, 2);
    }

    var state = {
      aim: { x: 0, y: 0 },            // pointer, -0.5..0.5
      look: { x: 0, y: 0 },
      light: { x: 0, y: 0 }, lightT: { x: 0, y: 0 },
      lit: 0, litT: 0,
      scroll: 0,
      visible: true
    };

    var W = 0, H = 0, dpr = 1;
    function resize() {
      W = hero.clientWidth;
      H = hero.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (scaler) upload(drawnWidth());
    }

    function ease(cur, target, dt, tau) {
      return cur + (target - cur) * (1 - Math.exp(-dt / tau));
    }

    var t0 = performance.now(), last = t0, raf = 0;
    function frame(now) {
      if (!state.visible) { raf = 0; return; }
      raf = requestAnimationFrame(frame);
      if (!ready) return;
      if (isVideo && source.readyState >= 2) upload();

      var dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      state.look.x = ease(state.look.x, state.aim.x, dt, EASE_LOOK);
      state.look.y = ease(state.look.y, state.aim.y, dt, EASE_LOOK);
      state.light.x = ease(state.light.x, state.lightT.x, dt, EASE_LIGHT);
      state.light.y = ease(state.light.y, state.lightT.y, dt, EASE_LIGHT);
      state.lit = ease(state.lit, state.litT, dt, EASE_LIT);

      var iw = Math.max(CROP_W * W, CROP_MIN_W);
      var ih = iw * IMG_H / IMG_W;
      var rx = W / 2 - iw / 2;
      var ry = ANCHOR_Y - ih / 2 + Math.min(state.scroll, H) * 0.25;

      // content moves against the pointer
      var sx = -state.look.x * 2 * TURN_X * W;
      var sy = -state.look.y * 2 * TURN_Y * H;

      // zoom in just enough that the bottom edge never shows (the still has
      // no slack below the floor); 1.0 at rest
      var vpY = ry + VP_V * ih;
      var below = ry + ih - H;                         // slack under the frame
      var need = Math.max(0, -sy * 1.15 - below + 2);
      var dolly = Math.min(1, state.scroll / Math.max(1, H));
      var zoom = 1 + need / Math.max(1, H - vpY) + dolly * dolly * 0.16;

      // floor light: perspective-sized pool, out when aiming above the floor
      var floorY = ry + FLOOR_V * ih + sy;
      var depth = Math.max(0, Math.min(1, (state.light.y - floorY) / Math.max(1, H - floorY)));
      var onFloor = Math.max(0, Math.min(1, (state.light.y - floorY + 24) / 48));

      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uDpr, dpr);
      gl.uniform4f(u.uRect, rx, ry, iw, ih);
      gl.uniform2f(u.uShift, sx, sy);
      gl.uniform1f(u.uZoom, zoom);
      gl.uniform1f(u.uTime, (now - t0) / 1000);
      gl.uniform2f(u.uLight, state.light.x, state.light.y);
      gl.uniform1f(u.uLightR, 70 + 300 * depth);
      gl.uniform1f(u.uLit, state.lit * onFloor);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

    function show() {
      ready = true;
      resize();
      mount.appendChild(canvas);
      hero.classList.add('hero--gl');
      start();
    }

    function onSourceReady() {
      if (upload(drawnWidth())) return show();
      if (isVideo) return fail();
      loadInlineTexture(function (img) {
        if (!img) return fail();
        source = img;
        if (upload(drawnWidth())) show();
        else fail();
      });
    }
    function fail() {
      setTimeout(function () { hero.dispatchEvent(new CustomEvent('herosceneerror')); }, 0);
    }

    if (isVideo) {
      if (source.readyState >= 2) onSourceReady();
      else source.addEventListener('loadeddata', onSourceReady, { once: true });
    } else if (source.complete && source.naturalWidth) {
      onSourceReady();
    } else {
      source.addEventListener('load', onSourceReady, { once: true });
    }

    window.addEventListener('resize', function () { if (ready) resize(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        state.visible = entries[0].isIntersecting && !document.hidden;
        if (state.visible) start();
      }).observe(hero);
    }
    document.addEventListener('visibilitychange', function () {
      state.visible = !document.hidden;
      if (state.visible) start();
    });

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      hero.classList.remove('hero--gl');
      state.visible = false;
    });

    return {
      // nx, ny: pointer in -0.5..0.5; x, y: pointer in hero CSS px
      point: function (nx, ny, x, y) {
        state.aim.x = nx;
        state.aim.y = ny;
        if (!state.litT) { state.light.x = x; state.light.y = y; }
        state.lightT.x = x;
        state.lightT.y = y;
        state.litT = 1;
      },
      leave: function () {
        state.aim.x = state.aim.y = 0;
        state.litT = 0;
      },
      scroll: function (y) { state.scroll = y; }
    };
  }

  window.CoramHeroScene = { init: init };
})();
