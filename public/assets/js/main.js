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

  // barra fixa no mobile: aparece depois do hero, some no convite final
  var dock = $('#dock'), heroCta = $('#hero-cta'), finalCta = $('#final-cta');
  if (dock && 'IntersectionObserver' in window) {
    var vis = { hero: true, fin: false };
    var upd = function () { var on = !vis.hero && !vis.fin; dock.classList.toggle('show', on); document.body.classList.toggle('has-dock', on); };
    new IntersectionObserver(function (es) { vis.hero = es[0].isIntersecting; upd(); }).observe(heroCta);
    new IntersectionObserver(function (es) { vis.fin = es[0].isIntersecting; upd(); }).observe(finalCta);
  }

  // ampliar prints
  var lb = $('#lb'), lbImg = $('#lb-img');
  document.querySelectorAll('.shot').forEach(function (b) {
    b.addEventListener('click', function () {
      lbImg.src = b.dataset.full; lbImg.alt = b.dataset.alt;
      if (lb.showModal) { lb.showModal(); } else { lb.setAttribute('open', ''); }
    });
  });
  $('#lb-close').addEventListener('click', function () { lb.close(); });
  lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); });

  // copiar convite
  var copy = $('#copy'), txt = $('#invite-text'), LABEL = 'Copiar convite';
  copy.addEventListener('click', function () {
    var value = copy.getAttribute('data-invite') || 'https://discord.gg/B7EYXPQndC'; // data-invite: convite do afiliado (ref.js)
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
