// Hero "server room" scene — a WebGL take on a 3D look-around (reference:
// EDOLUS). The still is re-projected through a depth model of the corridor:
// everything converges on the lit doorway, so the racks at the frame edges
// travel further than the far wall when the camera turns. On top: a gently
// rippling wet floor, a breathing light cone, blinking rack LEDs and a warm
// light that follows the pointer.
//
// At rest (pointer away, no scroll) the frame matches the Figma crop exactly.
(function () {
  'use strict';

  // Figma crop of the 3456×1990 still in the 1440×812 hero: w 130.83%,
  // centred, image centre 269.3px from the top (see .hero__image in CSS).
  var IMG_W = 3456, IMG_H = 1990;
  var CROP_W = 1.3083, CROP_MIN_W = 1883.95, ANCHOR_Y = 269.3;

  var VERT = [
    'attribute vec2 aPos;',
    'void main() { gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  // Scene landmarks in image UV (measured on the Figma frame):
  //   vanishing point / doorway (0.5, 0.537)
  //   light cone: apex above the frame, half-width grows 0.414px per px
  //   down from y = -248 (hero px) and stops at the floor, v ≈ 0.58
  //   wet floor from v ≈ 0.62
  var FRAG = [
    'precision highp float;',
    'uniform sampler2D uTex;',
    'uniform vec2 uRes;',        // canvas size, device px
    'uniform float uDpr;',
    'uniform vec4 uRect;',       // image rect in CSS px: x, y, w, h
    'uniform vec2 uLook;',       // camera turn, -1..1
    'uniform float uZoom;',
    'uniform float uTime;',
    'uniform vec2 uLight;',      // pointer, CSS px
    'uniform float uLit;',
    'uniform float uLightR;',
    '',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    '',
    'void main() {',
    '  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;',
    '  vec2 uv = (css - uRect.xy) / uRect.zw;',
    '  vec2 vp = vec2(0.5, 0.537);',
    '  uv = vp + (uv - vp) / uZoom;',
    '',
    '  // light cone mask (triangle from the apex down to the floor)',
    '  float coneW = max(0.0, (uv.y * 1084.8 - 25.0) * 0.414 / 1883.95);',
    '  float cone = (1.0 - smoothstep(0.57, 0.61, uv.y))',
    '             * (1.0 - smoothstep(coneW * 0.9, coneW * 1.12 + 0.004, abs(uv.x - 0.5)));',
    '',
    '  // corridor depth: 0 at the doorway, 1 at the frame edge',
    '  vec2 d = uv - vp;',
    '  float t = max(abs(d.x) / 0.5, abs(d.y) / 0.46);',
    '  float nearness = smoothstep(0.06, 1.0, t) * (1.0 - cone * 0.6);',
    '  uv -= uLook * nearness * vec2(0.022, 0.012);',
    '',
    '  // wet floor: slow horizontal shimmer in the reflections',
    '  float floorM = smoothstep(0.6, 0.72, uv.y);',
    '  uv.x += (sin(uv.y * 260.0 + uTime * 1.6) * 0.0009',
    '         + sin(uv.y * 97.0 - uTime * 1.1) * 0.0006) * floorM;',
    '',
    '  uv = clamp(uv, vec2(0.0005), vec2(0.9995));',
    '  vec3 c = texture2D(uTex, uv).rgb;',
    '',
    '  // breathing light cone',
    '  c *= 1.0 + cone * 0.07 * sin(uTime * 1.2);',
    '',
    '  // rack LEDs: small white-ish highlights blink at random',
    '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
    '  float white = 1.0 - smoothstep(0.25, 0.6, (c.r - c.b) / (l + 0.01));',
    '  vec2 cell = floor(uv * vec2(1884.0, 1085.0) / 4.0);',
    '  float blink = step(0.93, hash(cell + floor(uTime * 2.2 + hash(cell) * 9.0)));',
    '  float led = smoothstep(0.16, 0.38, l) * white * (1.0 - cone) * (1.0 - floorM);',
    '  c *= 1.0 - led * blink * 0.6;',
    '',
    '  // warm light that follows the pointer (lights surfaces, not fog)',
    '  vec2 lp = css - uLight;',
    '  float fl = exp(-dot(lp, lp) / (uLightR * uLightR)) * uLit;',
    '  c = c * (1.0 + fl * 1.1) + vec3(1.0, 0.86, 0.66) * fl * 0.025;',
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
    ['uTex', 'uRes', 'uDpr', 'uRect', 'uLook', 'uZoom', 'uTime', 'uLight', 'uLit', 'uLightR']
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
        var w = Math.min(IMG_W, Math.round(targetW || IMG_W));
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
        return false;
      }
    }
    function drawnWidth() {
      return Math.max(CROP_W * hero.clientWidth, CROP_MIN_W) * Math.min(window.devicePixelRatio || 1, 2);
    }

    var state = {
      look: { x: 0, y: 0 }, lookT: { x: 0, y: 0 },
      zoom: 1, zoomT: 1,
      lit: 0, litT: 0,
      light: { x: 0, y: 0 },
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

    var t0 = performance.now();
    function frame(now) {
      if (!state.visible) { raf = 0; return; }
      raf = requestAnimationFrame(frame);
      if (!ready) return;
      if (isVideo && source.readyState >= 2) upload();

      var k = 0.07;
      state.look.x += (state.lookT.x - state.look.x) * k;
      state.look.y += (state.lookT.y - state.look.y) * k;
      state.zoom += (state.zoomT - state.zoom) * 0.05;
      state.lit += (state.litT - state.lit) * 0.06;

      var iw = Math.max(CROP_W * W, CROP_MIN_W);
      var ih = iw * IMG_H / IMG_W;
      var sy = Math.min(state.scroll, H) * 0.25;

      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uDpr, dpr);
      gl.uniform4f(u.uRect, W / 2 - iw / 2, ANCHOR_Y - ih / 2 + sy, iw, ih);
      gl.uniform2f(u.uLook, state.look.x, state.look.y);
      gl.uniform1f(u.uZoom, state.zoom);
      gl.uniform1f(u.uTime, (now - t0) / 1000);
      gl.uniform2f(u.uLight, state.light.x, state.light.y);
      gl.uniform1f(u.uLit, state.lit);
      gl.uniform1f(u.uLightR, 260);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    var raf = 0;
    function start() { if (!raf) raf = requestAnimationFrame(frame); }

    function onSourceReady() {
      if (!upload(drawnWidth())) {
        // e.g. opened from file:// — the browser won't hand the pixels to WebGL
        setTimeout(function () { hero.dispatchEvent(new CustomEvent('herosceneerror')); }, 0);
        return;
      }
      ready = true;
      resize();
      mount.appendChild(canvas);
      hero.classList.add('hero--gl');
      start();
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
        state.visible = entries[0].isIntersecting;
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
      point: function (nx, ny, x, y) {
        state.lookT.x = nx * 2;
        state.lookT.y = ny * 2;
        state.zoomT = 1.035;
        state.light.x = x;
        state.light.y = y;
        state.litT = 1;
      },
      leave: function () {
        state.lookT.x = state.lookT.y = 0;
        state.zoomT = 1;
        state.litT = 0;
      },
      scroll: function (y) { state.scroll = y; }
    };
  }

  window.CoramHeroScene = { init: init };
})();
