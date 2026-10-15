// Afiliados: ?ref=CODIGO troca o convite geral do Discord pelo convite exclusivo
// do afiliado durante 30 dias (vale o último código válido). Guarda localmente
// só o código, o convite e um visitor_id aleatório. Falhas aqui nunca afetam a página:
// sem atribuição válida, tudo continua com o convite geral.
(function () {
  'use strict';

  var KEY_REF = 'imperium_ref';
  var KEY_VISITOR = 'imperium_visitor';
  var TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var CODE_RE = /^[A-Z0-9_-]{3,32}$/;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  var INVITE_RE = /^https:\/\/discord\.gg\/[A-Za-z0-9-]{2,32}$/;
  var ENDPOINT = '/api/ref';

  // localStorage pode estar bloqueado; nesse caso vale só para esta página
  var memory = {};
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return memory[k] || null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { memory[k] = v; } },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (e) {} delete memory[k]; }
  };

  // ---------- convites na página

  var links = Array.prototype.slice.call(document.querySelectorAll('a[href^="https://discord.gg/"]'));
  links.forEach(function (a) { a.setAttribute('data-general-invite', a.getAttribute('href')); });
  var copyBtn = document.getElementById('copy');
  var inviteText = document.getElementById('invite-text');
  var generalText = inviteText ? inviteText.textContent : '';

  // convites longos (URLs personalizadas) reduzem a fonte só o necessário para caber na tessera
  // (a coluna cresce junto com o texto, então a largura disponível é medida com o convite geral, que cabe por design)
  function fitInviteText() {
    if (!inviteText || !inviteText.style) return;
    var text = inviteText.textContent;
    var ticket = inviteText.closest('.t-body');
    if (!ticket || text === generalText) { inviteText.style.fontSize = ''; return; }
    inviteText.style.fontSize = '';
    inviteText.textContent = generalText;
    var pad = window.getComputedStyle(ticket);
    var available = ticket.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
    inviteText.textContent = text;
    var needed = inviteText.scrollWidth;
    if (available && needed > available) {
      var size = parseFloat(window.getComputedStyle(inviteText).fontSize);
      inviteText.style.fontSize = Math.floor(size * available / needed) + 'px';
    }
  }

  function showInvite(invite) {
    links.forEach(function (a) { a.setAttribute('href', invite || a.getAttribute('data-general-invite')); });
    if (copyBtn) {
      if (invite) copyBtn.setAttribute('data-invite', invite);
      else copyBtn.removeAttribute('data-invite');
    }
    if (inviteText) {
      inviteText.textContent = invite ? invite.replace(/^https:\/\//, '') : generalText;
      try { fitInviteText(); } catch (e) {}
    }
  }

  window.addEventListener('resize', function () { try { if (current) fitInviteText(); } catch (e) {} });

  // ---------- atribuição

  function randomUuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 0x100).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function visitorId() {
    var id = store.get(KEY_VISITOR);
    if (!id || !UUID_RE.test(id)) { id = randomUuid(); store.set(KEY_VISITOR, id); }
    return id;
  }

  function savedRef() {
    var raw = store.get(KEY_REF);
    if (!raw) return null;
    try {
      var ref = JSON.parse(raw);
      var age = Date.now() - ref.ts;
      if (ref && CODE_RE.test(ref.code) && INVITE_RE.test(ref.invite) && age >= 0 && age < TTL_MS) return ref;
    } catch (e) {}
    store.del(KEY_REF);
    return null;
  }

  function payload(code, event) {
    return JSON.stringify({ code: code, visitorId: visitorId(), event: event });
  }

  // resolve o convite no servidor; devolve null para código inativo, inexistente ou erro
  function resolve(code, event, done) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 4000) : null;
    fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: payload(code, event),
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) { done(data && INVITE_RE.test(data.invite) ? data.invite : null, true); })
      .catch(function () { done(null, false); })
      .then(function () { if (timer) clearTimeout(timer); });
  }

  function track(code) {
    var body = payload(code, 'click');
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return;
    } catch (e) {}
    try {
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'text/plain;charset=UTF-8' } })
        .catch(function () {});
    } catch (e) {}
  }

  var current = savedRef();
  if (current) showInvite(current.invite);

  var incoming = null;
  try {
    var url = new URL(window.location.href);
    if (url.searchParams.has('ref')) {
      incoming = String(url.searchParams.get('ref') || '').trim().toUpperCase();
      url.searchParams.delete('ref');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  } catch (e) {}

  if (incoming && CODE_RE.test(incoming)) {
    // chegada com ?ref: um código ativo substitui a atribuição anterior (último clique)
    resolve(incoming, 'visit', function (invite) {
      if (!invite) return;
      current = { code: incoming, invite: invite, ts: Date.now() };
      store.set(KEY_REF, JSON.stringify(current));
      showInvite(invite);
    });
  } else if (current) {
    // retorno dentro dos 30 dias: confirma que o afiliado segue ativo e o convite atual
    var code = current.code;
    resolve(code, null, function (invite, answered) {
      if (!current || current.code !== code || !answered) return;
      if (invite) {
        current.invite = invite;
        store.set(KEY_REF, JSON.stringify(current));
        showInvite(invite);
      } else {
        current = null;
        store.del(KEY_REF);
        showInvite(null);
      }
    });
  }

  // cliques nos botões do Discord e em "Copiar convite" enquanto houver atribuição
  document.addEventListener('click', function (e) {
    if (!current || !e.target || !e.target.closest) return;
    if (e.target.closest('#copy') || e.target.closest('a[data-general-invite]')) track(current.code);
  }, true);
})();
