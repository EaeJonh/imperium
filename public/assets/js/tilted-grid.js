// Faixa curva de imagens (port em JS puro do TiltedGridHero, sem React).
//
// Uma fileira de imagens corre da direita para a esquerda pelo lado de dentro
// de um cilindro: o centro fica de frente e plano, as pontas curvam na direção
// de quem olha e somem num fade. Como uma caixa CSS não curva, cada tile é
// cortado em SLICES faixas verticais, cada uma uma face plana do cilindro com
// a sua parte da imagem. As faixas ficam paradas dentro do tile, cada uma
// girada alguns graus em torno do eixo do cilindro, e é o tile (preserve-3d)
// que se move: um único rotateY em torno desse eixo leva o tile inteiro pelo
// arco. Só o atraso da animação muda de um tile para outro.
//
// Uso: <div class="tg" data-tilted-grid data-images="/a.webp,/b.webp" hidden></div>
// Opções em data-*: speed, tile-height, aspect, gap, axis, curve, fade e, abaixo
// de NARROW px, curve-narrow e tile-height-narrow.
// Clicar num tile dispara `tiltedgrid:open` (bubbles) com { src } da imagem que
// ele mostra; quem usa a faixa decide o que fazer (aqui, o visualizador do main.js).
(function () {
  'use strict';

  // Faixas por tile: poucas mostram os cantos das faces nas bordas.
  var SLICES = 16;
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
  // Faixas ímpares ficam EDGE px mais largas para cobrir a emenda com a vizinha
  // e DEPTH px mais longe do eixo, atrás das pares. Assim nenhuma face cruza a
  // outra: com faces que se cruzam o navegador recorta os planos para ordená-los
  // e às vezes deixa uma linha escura na emenda.
  var EDGE = 1;
  var DEPTH = 0.5;

  // Sem container queries ou ResizeObserver não há como medir: a faixa fica oculta.
  if (!window.ResizeObserver || !window.CSS || !CSS.supports('width', '1cqw')) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var instances = 0;

  // Raio do cilindro, em fração da largura, que põe a borda do quadro `bend`
  // radianos ao longo do arco vista pela câmera.
  function arc(bend) {
    return (CAMERA - 1 + Math.cos(bend)) / (2 * CAMERA * Math.sin(bend));
  }

  function round(n) { return +n.toFixed(4); }
  function deg(rad) { return (rad * 180) / Math.PI; }

  // Distribui a fileira no cilindro. Ângulos em graus: `unit` é o arco de uma
  // altura de tile, `limit` até onde o centro de um tile vai antes de sair
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
    var unit = deg(h / radius);
    var pitch = (o.aspect + o.gap / 100) * unit;
    var limit = deg(bend) + (o.aspect * unit) / 2;
    var columns = Math.min(60, Math.max(2, Math.ceil((2 * limit) / pitch)));
    var sweep = round((columns * pitch) / 2);
    return {
      narrow: narrow, maxWidth: maxWidth, bend: bend, tileHeight: tileHeight,
      columns: columns, sweep: sweep, unit: round(unit), limit: round(Math.min(sweep, limit))
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

    var id = ++instances;
    var orbit = 'tg-o-' + id;
    var tileClass = 'tg-t-' + id;
    var share = o.aspect / SLICES;
    // Raio, altura e largura máxima do tile mudam quando a faixa passa de NARROW; build() os define.
    var radius = '0cqw';
    var maxWidth = MAX_WIDTH;
    var tileHeight = o.tileHeight;

    // Todo comprimento é múltiplo da altura do tile, que acompanha a altura da
    // faixa até maxWidth limitar em telas estreitas.
    function u(n) {
      return 'calc(' + round(n) + ' * min(' + tileHeight + 'cqh, ' + round(maxWidth / o.aspect) + 'cqw))';
    }
    // Vai até o eixo, gira, volta: a caixa fica no cilindro no ângulo dado.
    function turn(d) {
      return 'translateZ(' + radius + ') rotateY(' + round(d) + 'deg) translateZ(-' + radius + ')';
    }

    root.hidden = false;
    var style = document.createElement('style');
    var band = document.createElement('div');
    band.className = 'tg-band';
    band.setAttribute('aria-hidden', 'true');
    var mask = 'linear-gradient(90deg,transparent,#000 ' + o.fade + '%,#000 ' + (100 - o.fade) + '%,transparent)';
    band.style.perspectiveOrigin = '50% ' + o.axis + '%';
    band.style.maskImage = mask;
    band.style.webkitMaskImage = mask;
    root.insertBefore(band, root.firstChild);
    root.insertBefore(style, root.firstChild);

    // Baixa todas as imagens antes: um tile pega a próxima logo antes de voltar à tela.
    images.forEach(function (src) { new Image().src = src; });

    var layout = null;

    function build(next) {
      layout = next;
      var columns = next.columns, sweep = next.sweep, unit = next.unit, limit = next.limit;
      var r = 100 * arc(next.bend);
      radius = +r.toFixed(3) + 'cqw';
      maxWidth = next.maxWidth;
      tileHeight = next.tileHeight;
      band.style.perspective = +(r * CAMERA).toFixed(3) + 'cqw';
      var duration = columns * o.speed;
      // Além de `limit` o tile está fora da tela; é aí que ele dá a volta.
      var hide = round(((sweep - limit) / (2 * sweep || 1)) * 100);
      style.textContent =
        '@keyframes ' + orbit + '{' +
        'from{transform:' + turn(-sweep) + '}to{transform:' + turn(sweep) + '}' +
        '0%,' + hide + '%,' + (100 - hide) + '%,100%{visibility:hidden}' +
        (hide + 0.001) + '%,' + (100 - hide - 0.001) + '%{visibility:visible}}' +
        // Pausar em vez de remover deixa a faixa completa, como uma foto parada.
        '@media(prefers-reduced-motion:reduce){.' + tileClass + '{animation-play-state:paused}}';

      var frag = document.createDocumentFragment();
      for (var t = 0; t < columns; t++) frag.appendChild(makeTile(t, columns, duration, unit));
      band.replaceChildren(frag);
      band.classList.add('is-ready');
    }

    function makeTile(t, columns, duration, unit) {
      // Numera os tiles na ordem em que entram na tela.
      var first = columns - 1 - t;
      var tile = document.createElement('div');
      tile.className = 'tg-tile ' + tileClass;
      tile.style.left = 'calc(50% - ' + u(o.aspect / 2) + ')';
      tile.style.top = 'calc(' + o.axis + '% - ' + u(0.5) + ')';
      tile.style.width = u(o.aspect);
      tile.style.height = u(1);
      // Sem o atalho `animation`: ele gravaria animation-play-state inline e
      // anularia as pausas do CSS (fora da tela, hover e reduced motion).
      tile.style.animationName = orbit;
      tile.style.animationDuration = duration + 's';
      tile.style.animationTimingFunction = 'linear';
      tile.style.animationDelay = (-t * o.speed) + 's';
      tile.style.animationIterationCount = 'infinite';

      var imgs = [];
      for (var k = 0; k < SLICES; k++) {
        var slice = document.createElement('div');
        slice.className = 'tg-slice' + (k === 0 ? ' tg-first' : '') + (k === SLICES - 1 ? ' tg-last' : '');
        // Ímpar: EDGE a mais de cada lado (só do lado de dentro na última, que é
        // a borda do tile) e DEPTH para trás, sem cruzar as pares vizinhas.
        var odd = k % 2 === 1;
        var last = k === SLICES - 1;
        var pad = odd ? EDGE : 0;
        slice.style.left = 'calc(' + u((o.aspect - share) / 2) + ' - ' + pad + 'px)';
        slice.style.width = 'calc(' + u(share) + ' + ' + (last ? pad : 2 * pad) + 'px)';
        slice.style.height = u(1);
        // O giro é em torno do centro da parte da imagem, não da caixa alargada.
        if (odd && last) slice.style.transformOrigin = 'calc(50% + ' + pad / 2 + 'px) 50%';
        slice.style.transform = turn((o.aspect / 2 - (k + 0.5) * share) * unit) + (odd ? ' translateZ(-' + DEPTH + 'px)' : '');
        var img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        img.decoding = 'async';
        img.src = images[first % images.length];
        img.style.left = 'calc(' + u(-k * share) + ' + ' + pad + 'px)';
        img.style.width = u(o.aspect);
        img.style.height = u(1);
        slice.appendChild(img);
        tile.appendChild(slice);
        imgs.push(img);
      }

      tile.addEventListener('click', function () {
        root.dispatchEvent(new CustomEvent('tiltedgrid:open', { bubbles: true, detail: { src: imgs[0].getAttribute('src') } }));
      });

      // A cada volta (fora da tela) o tile passa para a próxima imagem da lista.
      tile.addEventListener('animationiteration', function (e) {
        var lap = Math.round(e.elapsedTime / duration);
        var src = images[(lap * columns + first) % images.length];
        if (imgs[0].getAttribute('src') !== src) imgs.forEach(function (img) { img.src = src; });
      });
      return tile;
    }

    new ResizeObserver(function (entries) {
      var rect = entries[0].contentRect;
      var next = measure(rect.width, rect.height, o);
      if (!next) return;
      if (layout && layout.narrow === next.narrow && layout.columns === next.columns && layout.sweep === next.sweep && layout.unit === next.unit) return;
      build(next);
    }).observe(root);

    // Fora da tela a animação para, para não gastar bateria à toa.
    if (window.IntersectionObserver && !reduceMotion) {
      new IntersectionObserver(function (entries) {
        root.classList.toggle('tg-paused', !entries[0].isIntersecting);
      }).observe(root);
    }
  }

  document.querySelectorAll('[data-tilted-grid]').forEach(function (el) {
    try { mount(el); } catch (e) { el.hidden = true; }
  });
})();
