(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // header com fundo ao rolar
  var top = $('#top');
  var onScroll = function () { top.classList.toggle('is-scrolled', window.scrollY > 24); };
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  // revelar ao entrar na tela
  var rv = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    rv.forEach(function (el) { io.observe(el); });
  } else { rv.forEach(function (el) { el.classList.add('in'); }); }

  // leve paralaxe do selo
  var box = $('#sealbox'), seal = $('#seal');
  if (box && !reduce && window.matchMedia('(hover: hover)').matches) {
    window.addEventListener('pointermove', function (e) {
      var r = box.getBoundingClientRect();
      var x = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      var y = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      seal.style.setProperty('--mx', (x * 2).toFixed(3));
      seal.style.setProperty('--my', (y * 2).toFixed(3));
    }, { passive: true });
  }

  // domínios: a luz da lista segue o ponteiro. Cada item recebe a posição
  // relativa a ele (--x/--y) e ao título (--nx/--ny); um quadro por movimento.
  var ledger = $('.ledger');
  if (ledger) {
    var rows = Array.prototype.slice.call(ledger.querySelectorAll('.dom'));
    var aim = function (row, x, y) {
      var r = row.getBoundingClientRect(), n = row.querySelector('.dom-name').getBoundingClientRect();
      row.style.setProperty('--x', (x - r.left).toFixed(1));
      row.style.setProperty('--y', (y - r.top).toFixed(1));
      row.style.setProperty('--nx', (x - n.left).toFixed(1));
      row.style.setProperty('--ny', (y - n.top).toFixed(1));
    };
    if (window.matchMedia('(hover: hover)').matches) {
      var frame = 0, px = 0, py = 0;
      var paint = function () { frame = 0; rows.forEach(function (row) { aim(row, px, py); }); };
      var track = function (e) { px = e.clientX; py = e.clientY; if (!frame) frame = requestAnimationFrame(paint); };
      ledger.addEventListener('pointermove', track, { passive: true });
      ledger.addEventListener('pointerenter', function (e) { ledger.classList.add('is-lit'); track(e); });
      ledger.addEventListener('pointerleave', function () { ledger.classList.remove('is-lit'); });
    }
    // teclado: a luz vai para o começo do título focado
    ledger.addEventListener('focusin', function (e) {
      var row = e.target.closest('.dom');
      if (!row) return;
      var n = row.querySelector('.dom-name').getBoundingClientRect();
      aim(row, n.left + n.width * 0.3, n.top + n.height / 2);
    });
  }

  // barra fixa no mobile: aparece depois do hero, some nos outros convites (feedbacks e final)
  var dock = $('#dock'), heroCta = $('#hero-cta'), proofCta = $('#proof-cta'), finalCta = $('#final-cta');
  if (dock && 'IntersectionObserver' in window) {
    var vis = { hero: true, mid: false, fin: false };
    var upd = function () { var on = !vis.hero && !vis.mid && !vis.fin; dock.classList.toggle('show', on); document.body.classList.toggle('has-dock', on); };
    new IntersectionObserver(function (es) { vis.hero = es[0].isIntersecting; upd(); }).observe(heroCta);
    if (proofCta) new IntersectionObserver(function (es) { vis.mid = es[0].isIntersecting; upd(); }).observe(proofCta);
    new IntersectionObserver(function (es) { vis.fin = es[0].isIntersecting; upd(); }).observe(finalCta);
  }

  // ampliar prints: pelos tiles da faixa curva (evento tiltedgrid:open) e pela
  // lista de avaliações em texto, que também dá o texto alternativo de cada print
  var lb = $('#lb'), lbImg = $('#lb-img'), altOf = {};
  var openPrint = function (src) {
    lbImg.src = src; lbImg.alt = altOf[src] || '';
    if (lb.showModal) { lb.showModal(); } else { lb.setAttribute('open', ''); }
  };
  document.querySelectorAll('[data-full]').forEach(function (b) {
    altOf[b.dataset.full] = b.dataset.alt;
    b.addEventListener('click', function () { openPrint(b.dataset.full); });
  });
  document.addEventListener('tiltedgrid:open', function (e) { openPrint(e.detail.src); });
  $('#lb-close').addEventListener('click', function () { lb.close(); });
  lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); });

  // copiar convite
  var copy = $('#copy'), txt = $('#invite-text'), LABEL = 'Copiar convite';
  copy.addEventListener('click', function () {
    var value = 'https://discord.gg/B7EYXPQndC';
    var reset = function () { setTimeout(function () { copy.textContent = LABEL; }, 2200); };
    var done = function () { copy.textContent = 'Convite copiado'; reset(); };
    var fallback = function () {
      var rg = document.createRange(); rg.selectNodeContents(txt);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg);
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      copy.textContent = ok ? 'Convite copiado' : 'Selecionado, use Ctrl+C'; reset();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done, fallback);
    } else { fallback(); }
  });
})();
