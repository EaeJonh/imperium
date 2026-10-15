// Fundo vivo da página (port em JS puro do Velaris, sem React).
//
// Um canvas WebGL fixo atrás de todo o conteúdo mistura três camadas de
// simplex noise sobre a cor de fundo, com um brilho no centro e vinheta nas
// bordas. As cores vêm de --velaris-1..4 no :root do styles.css (derivadas da
// paleta), então mudar a paleta muda o fundo. O granulado fica por conta do
// body::before, que já cobre a página.
//
// Para poupar bateria: o canvas é renderizado em meia resolução (o ruído é
// suave e o CSS estica sem perda visível), a 30 quadros por segundo, e para
// sozinho com a aba oculta. Com prefers-reduced-motion desenha um quadro parado.
// Sem WebGL nada é criado e fica o fundo sólido do body.
(function () {
  'use strict';

  var SCALE = 0.5;
  var FRAME_MS = 1000 / 30;
  var SPEED = 1.6;

  var VERTEX = [
    'attribute vec2 position;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = position * 0.5 + 0.5;',
    '  gl_Position = vec4(position, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FRAGMENT = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform vec2 u_resolution;',
    'uniform float u_time;',
    'uniform vec3 u_colors[4];',
    'uniform vec3 u_bg;',
    'vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }',
    'float snoise(vec2 v) {',
    '  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);',
    '  vec2 i = floor(v + dot(v, C.yy));',
    '  vec2 x0 = v - i + dot(i, C.xx);',
    '  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
    '  vec4 x12 = x0.xyxy + C.xxzz;',
    '  x12.xy -= i1;',
    '  i = mod(i, 289.0);',
    '  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));',
    '  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);',
    '  m = m * m;',
    '  m = m * m;',
    '  vec3 x = 2.0 * fract(p * C.www) - 1.0;',
    '  vec3 h = abs(x) - 0.5;',
    '  vec3 ox = floor(x + 0.5);',
    '  vec3 a0 = x - ox;',
    '  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);',
    '  vec3 g;',
    '  g.x = a0.x * x0.x + h.x * x0.y;',
    '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
    '  return 130.0 * dot(m, g);',
    '}',
    'void main() {',
    '  vec2 p = vUv - 0.5;',
    '  p.x *= u_resolution.x / u_resolution.y;',
    '  float t = u_time * 0.1;',
    '  float n1 = snoise(p * 0.4 + vec2(t * 0.2, -t * 0.3));',
    '  float n2 = snoise(p * 0.55 + vec2(-t * 0.15, t * 0.25) + n1 * 0.25);',
    '  float n3 = snoise(p * 0.75 + vec2(t * 0.1, -t * 0.2) + n2 * 0.2);',
    '  vec3 col = u_bg;',
    '  float dist = length(p) * 1.5;',
    '  float vignette = 1.0 - smoothstep(0.3, 1.2, dist);',
    '  col = mix(col, u_colors[0], smoothstep(-0.2, 0.5, n1) * 0.85);',
    '  col = mix(col, u_colors[1], smoothstep(-0.1, 0.6, n2) * 0.7);',
    '  col = mix(col, u_colors[2], smoothstep(-0.3, 0.4, n3) * 0.6);',
    '  col = mix(col, u_colors[3], smoothstep(0.0, 0.7, n1 * n2) * 0.5);',
    '  col += u_colors[1] * smoothstep(0.8, 0.0, dist) * 0.3;',
    '  col = mix(col * 0.2, col, vignette);',
    // a vinheta escurece só até o fundo da página, para as bordas não ficarem pretas
    '  col = max(col, u_bg * 0.85);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var canvas = document.createElement('canvas');
  var gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
  if (!gl) return;

  // Resolve uma cor CSS (hex, var(), color-mix) para [r, g, b] em 0..1.
  var probe = document.createElement('i');
  probe.style.display = 'none';
  document.body.appendChild(probe);
  function cssColor(value) {
    probe.style.color = '';
    probe.style.color = value;
    var c = getComputedStyle(probe).color;
    var nums = (c.match(/[\d.]+/g) || []).map(Number);
    var srgb = c.indexOf('color(') === 0;
    if (nums.length < 3) return [0, 0, 0];
    return srgb ? nums.slice(0, 3) : nums.slice(0, 3).map(function (n) { return n / 255; });
  }

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }
  var vs = compile(gl.VERTEX_SHADER, VERTEX);
  var fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) { probe.remove(); return; }
  var program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { probe.remove(); return; }
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var pos = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(program, 'u_resolution');
  var uTime = gl.getUniformLocation(program, 'u_time');
  var uColors = gl.getUniformLocation(program, 'u_colors');
  var uBg = gl.getUniformLocation(program, 'u_bg');

  var root = getComputedStyle(document.documentElement);
  var colors = [];
  for (var i = 1; i <= 4; i++) colors = colors.concat(cssColor(root.getPropertyValue('--velaris-' + i).trim() || '#000'));
  gl.uniform3fv(uColors, new Float32Array(colors));
  gl.uniform3fv(uBg, new Float32Array(cssColor(root.getPropertyValue('--background').trim() || '#000')));
  probe.remove();

  canvas.className = 'velaris';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var raf = 0, last = -Infinity;

  function draw(ms) {
    gl.uniform1f(uTime, ms * 0.001 * SPEED);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function resize() {
    var w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
    var h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
    draw(performance.now());
  }

  function loop(ms) {
    raf = requestAnimationFrame(loop);
    if (ms - last < FRAME_MS) return;
    last = ms;
    draw(ms);
  }

  function start() {
    cancelAnimationFrame(raf);
    if (reduceMotion && reduceMotion.matches) draw(0);
    else raf = requestAnimationFrame(loop);
  }

  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);
  resize();
  start();
  if (reduceMotion && reduceMotion.addEventListener) reduceMotion.addEventListener('change', start);
})();
