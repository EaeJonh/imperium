// Faixa curva de imagens (port em JS puro do TiltedGridHero, sem React).
//
// Uma fileira de imagens corre da direita para a esquerda pelo lado de dentro
// de um cilindro: o centro fica de frente e plano, as pontas curvam na direção
// de quem olha e somem num fade.
//
// Tudo é desenhado num único <canvas> 2D. Cada tile é projetado em tiras
// verticais finas (STRIP_PX na tela), cada uma com a sua parte da imagem, na
// altura que a perspectiva dá àquele ponto do cilindro. A primeira versão
// usava uma caixa CSS 3D por fatia; com dezenas de camadas o navegador às
// vezes as ordenava ou rasterizava fora de tempo e piscava uma emenda escura.
// No canvas as tiras vizinhas se sobrepõem um pouco e são pintadas juntas,
// então não há emenda para abrir.
//
// Uso: <div class="tg" data-tilted-grid data-images="/a.webp,/b.webp" hidden></div>
// Opções em data-*: speed, tile-height, aspect, gap, axis, curve, fade e, abaixo
// de NARROW px, curve-narrow e tile-height-narrow.
// Clicar num tile dispara `tiltedgrid:open` (bubbles) com { src } da imagem que
// ele mostra; quem usa a faixa decide o que fazer (aqui, o visualizador do main.js).
(function () {
  'use strict';

  // Distância da câmera, em raios do cilindro: logo depois do eixo, para as
  // pontas chegarem perto da lente e crescerem.
  var CAMERA = 1.6;
  // Um tile nunca passa desta % da largura, para o celular ainda mostrar vizinhos.
  var MAX_WIDTH = 55;
  // Abaixo desta largura (px) a faixa usa um tile maior e uma curva mais aberta
  // (data-curve-narrow): com o raio pequeno do celular, a curva normal enrolava
  // o tile do centro e deixava os vizinhos quase de lado.
  var NARROW = 640;
  var NARROW_MAX_WIDTH = 78;
  // Largura de cada tira na tela: fina o bastante para a borda curva não serrilhar.
  var STRIP_PX = 2.5;

  if (!window.ResizeObserver) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Raio do cilindro, em fração da largura, que põe a borda do quadro `bend`
  // radianos ao longo do arco vista pela câmera.
  function arc(bend) {
    return (CAMERA - 1 + Math.cos(bend)) / (2 * CAMERA * Math.sin(bend));
  }

  // Distribui a fileira no cilindro. Ângulos em radianos: `unit` é o arco de
  // uma altura de tile, `limit` até onde o centro de um tile vai antes de sair
  // inteiro da tela e `sweep` onde ficam as pontas do loop (sempre além de
  // `limit`, para um tile só reaparecer do outro lado fora de vista).
  function measure(width, height, o) {
    var narrow = width < NARROW;
    var maxWidth = narrow ? NARROW_MAX_WIDTH : MAX_WIDTH;
    var bend = narrow ? o.bendNarrow : o.bend;
    var tileHeight = narrow ? o.tileHeightNarrow : o.tileHeight;
    var h = Math.min((tileHeight / 100) * height, ((maxWidth / 100) * width) / o.aspect);
    var radius = width * arc(bend);
    if (!(h > 0) || !(radius > 0)) return null;
    var unit = h / radius;
    var pitch = (o.aspect + o.gap / 100) * unit;
    var limit = bend + (o.aspect * unit) / 2;
    var columns = Math.min(60, Math.max(2, Math.ceil((2 * limit) / pitch)));
    var sweep = (columns * pitch) / 2;
    return {
      h: h, radius: radius, unit: unit, columns: columns, sweep: sweep,
      limit: Math.min(sweep, limit), duration: columns * o.speed
    };
  }

  function bendOf(degrees) {
    return (Math.min(85, Math.max(5, degrees)) * Math.PI) / 180;
  }

  function num(el, name, fallback) {
    var v = parseFloat(el.getAttribute('data-' + name));
    return isFinite(v) ? v : fallback;
  }

  function mount(root) {
    var images = (root.getAttribute('data-images') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!images.length) return;

    var o = {
      speed: num(root, 'speed', 4),
      tileHeight: num(root, 'tile-height', 26),
      aspect: num(root, 'aspect', 16 / 9),
      gap: num(root, 'gap', 6),
      axis: num(root, 'axis', 56),
      fade: num(root, 'fade', 12)
    };
    o.bend = bendOf(num(root, 'curve', 80));
    o.bendNarrow = bendOf(num(root, 'curve-narrow', 40));
    o.tileHeightNarrow = num(root, 'tile-height-narrow', 62);

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;

    var band = document.createElement('div');
    band.className = 'tg-band';
    band.setAttribute('aria-hidden', 'true');
    var mask = 'linear-gradient(90deg,transparent,#000 ' + o.fade + '%,#000 ' + (100 - o.fade) + '%,transparent)';
    band.style.maskImage = mask;
    band.style.webkitMaskImage = mask;
    band.appendChild(canvas);
    root.insertBefore(band, root.firstChild);
    root.hidden = false;

    // Baixa todas as imagens já: um tile pega a próxima logo antes de voltar à tela.
    var pics = images.map(function (src) {
      var img = new Image();
      img.decoding = 'async';
      img.addEventListener('load', function () { if (!raf) draw(); });
      img.src = src;
      return img;
    });

    var L = null, W = 0, H = 0, dpr = 1;
    var time = 0, last = 0, raf = 0;
    var onScreen = true, hover = -1;
    // Para o teste de clique: por tile desenhado, x das bordas das tiras e meia altura.
    var drawn = [];

    function resize() {
      var w = root.clientWidth, h = root.clientHeight;
      if (!w || !h) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      W = w; H = h;
      L = measure(w, h, o);
      // Parado (reduced motion): o primeiro tile fica bem de frente.
      if (reduceMotion && L) time = L.duration / 2;
      band.classList.add('is-ready');
      draw();
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      drawn = [];
      if (!L) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      var R = L.radius, P = R * CAMERA, cx = W / 2, axisY = (H * o.axis) / 100;
      var half = (o.aspect / 2) * L.unit, span = o.aspect * L.unit;

      for (var t = 0; t < L.columns; t++) {
        var cycle = (time + t * o.speed) / L.duration;
        var lap = Math.floor(cycle);
        var d = -L.sweep + 2 * L.sweep * (cycle - lap);
        if (Math.abs(d) > L.limit) continue;

        var first = L.columns - 1 - t;
        var pic = pics[(lap * L.columns + first) % pics.length];
        if (!pic.complete || !pic.naturalWidth) continue;

        // Recorte "cover" da imagem para a proporção do tile.
        var iw = pic.naturalWidth, ih = pic.naturalHeight;
        var sw = iw, sh = ih, sx = 0, sy = 0;
        if (iw / ih > o.aspect) { sw = ih * o.aspect; sx = (iw - sw) / 2; }
        else { sh = iw / o.aspect; sy = (ih - sh) / 2; }

        // Ângulo de cada coluna da imagem: a borda esquerda (u = 0) é a de ângulo maior.
        var aLeft = d + half, aRight = d - half;
        var xa = cx - R * Math.sin(aLeft) * P / (P - R * (1 - Math.cos(aLeft)));
        var xb = cx - R * Math.sin(aRight) * P / (P - R * (1 - Math.cos(aRight)));
        var n = Math.max(12, Math.min(400, Math.ceil(Math.abs(xb - xa) / STRIP_PX)));

        var xs = [], hs = [];
        var px = xa, ps = P / (P - R * (1 - Math.cos(aLeft)));
        for (var i = 1; i <= n; i++) {
          var a = aLeft - (span * i) / n;
          var z = R * (1 - Math.cos(a));
          if (P - z <= 1) break;
          var s = P / (P - z);
          var x = cx - R * Math.sin(a) * s;
          var hh = (L.h / 2) * (ps + s) / 2;
          if (x > px && x > 0 && px < W) {
            // +0.75px: cada tira cobre o começo da seguinte, sem fresta entre elas.
            ctx.drawImage(pic, sx + (sw * (i - 1)) / n, sy, sw / n, sh, px, axisY - hh, x - px + 0.75, 2 * hh);
            if (t === hover) {
              ctx.fillStyle = 'rgba(255, 244, 222, 0.08)';
              ctx.fillRect(px, axisY - hh, x - px + 0.75, 2 * hh);
            }
          }
          xs.push(px); hs.push(hh);
          px = x; ps = s;
        }
        xs.push(px);
        drawn.push({ t: t, src: pic.getAttribute('src'), xs: xs, hs: hs });
      }
    }

    function hit(e) {
      var r = canvas.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top, axisY = (H * o.axis) / 100;
      for (var k = 0; k < drawn.length; k++) {
        var tile = drawn[k], xs = tile.xs;
        if (x < xs[0] || x >= xs[xs.length - 1]) continue;
        for (var i = 0; i < tile.hs.length; i++) {
          if (x < xs[i + 1]) return Math.abs(y - axisY) <= tile.hs[i] ? tile : null;
        }
      }
      return null;
    }

    function frame(now) {
      raf = 0;
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (L) time += dt;
      draw();
      if (!reduceMotion && onScreen && hover < 0) raf = requestAnimationFrame(frame);
    }

    // (Re)começa a andar: só na tela, sem mouse em cima de um print e sem
    // reduced motion. Zera `last` para a pausa não virar um salto.
    function schedule() {
      if (raf || reduceMotion || !onScreen || hover >= 0) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var tile = hit(e);
      var next = tile ? tile.t : -1;
      canvas.style.cursor = tile ? 'zoom-in' : '';
      if (next === hover) return;
      hover = next;
      if (hover >= 0) stop();
      draw();
      schedule();
    });
    canvas.addEventListener('pointerleave', function () {
      if (hover < 0) return;
      hover = -1;
      canvas.style.cursor = '';
      draw();
      schedule();
    });
    canvas.addEventListener('click', function (e) {
      var tile = hit(e);
      if (tile) root.dispatchEvent(new CustomEvent('tiltedgrid:open', { bubbles: true, detail: { src: tile.src } }));
    });

    new ResizeObserver(resize).observe(root);

    // Fora da tela a animação para, para não gastar bateria à toa.
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        if (onScreen) schedule(); else stop();
      }).observe(root);
    }
    schedule();
  }

  document.querySelectorAll('[data-tilted-grid]').forEach(function (el) {
    try { mount(el); } catch (e) { el.hidden = true; }
  });
})();
