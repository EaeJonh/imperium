// Executa public/assets/js/ref.js num DOM mínimo simulado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const SCRIPT = readFileSync(new URL('../public/assets/js/ref.js', import.meta.url), 'utf8');
const GENERAL = 'https://discord.gg/B7EYXPQndC';
const DAY = 24 * 60 * 60 * 1000;

function element(attrs = {}, id = null) {
  const a = { ...attrs };
  return {
    id,
    textContent: '',
    getAttribute: (k) => (k in a ? a[k] : null),
    setAttribute: (k, v) => { a[k] = String(v); },
    removeAttribute: (k) => { delete a[k]; },
    closest(sel) {
      if (sel === '#copy') return this.id === 'copy' ? this : null;
      if (sel === 'a[data-general-invite]') return 'data-general-invite' in a ? this : null;
      throw new Error(`seletor não simulado: ${sel}`);
    },
  };
}

// serverInvites: código -> convite devolvido pelo /api/ref (ausente = null)
function setup({ url = 'https://imperiumblox.shop/', storage = {}, serverInvites = {}, failFetch = false } = {}) {
  const links = Array.from({ length: 3 }, () => element({ href: GENERAL }));
  const copy = element({}, 'copy');
  const inviteText = element({}, 'invite-text');
  inviteText.textContent = 'discord.gg/B7EYXPQndC';
  const store = { ...storage };
  const requests = [];
  const beacons = [];
  const listeners = [];
  const location = new URL(url);

  const ctx = {
    URL, Blob, JSON, Date, Uint8Array, setTimeout, clearTimeout, AbortController,
    location: { get href() { return location.href; }, origin: location.origin },
    history: {
      state: null,
      replaceState(_s, _t, next) { const u = new URL(next, location.origin); location.pathname = u.pathname; location.search = u.search; location.hash = u.hash; },
    },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    crypto: webcrypto,
    addEventListener: () => {},
    navigator: { sendBeacon: (endpoint, blob) => { beacons.push({ endpoint, blob }); return true; } },
    document: {
      querySelectorAll: (sel) => {
        assert.equal(sel, 'a[href^="https://discord.gg/"]');
        return links.filter((l) => l.getAttribute('href').startsWith('https://discord.gg/'));
      },
      getElementById: (id) => ({ copy, 'invite-text': inviteText })[id] || null,
      addEventListener: (type, fn) => listeners.push({ type, fn }),
    },
    fetch: async (endpoint, init) => {
      const payload = JSON.parse(init.body);
      requests.push({ endpoint, ...payload });
      if (failFetch) throw new Error('rede');
      return { ok: true, json: async () => ({ invite: serverInvites[payload.code] ?? null }) };
    },
  };
  ctx.window = ctx;
  vm.runInNewContext(SCRIPT, ctx);

  return {
    links, copy, inviteText, store, requests, beacons, location,
    click: (target) => listeners.filter((l) => l.type === 'click').forEach((l) => l.fn({ target })),
    hrefs: () => links.map((l) => l.getAttribute('href')),
    beaconPayloads: async () => Promise.all(beacons.map(async (b) => JSON.parse(await b.blob.text()))),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 10));

test('sem ?ref e sem atribuição: nada muda e nenhuma requisição é feita', async () => {
  const page = setup();
  await flush();
  assert.deepEqual(page.hrefs(), [GENERAL, GENERAL, GENERAL]);
  assert.equal(page.inviteText.textContent, 'discord.gg/B7EYXPQndC');
  assert.equal(page.copy.getAttribute('data-invite'), null);
  assert.equal(page.requests.length, 0);
  page.click(page.links[0]);
  assert.equal(page.beacons.length, 0);
});

test('?ref ativo: registra visita, troca todos os convites, guarda 30 dias e limpa a URL', async () => {
  const page = setup({ url: 'https://imperiumblox.shop/?ref=ruan10&utm=x#entrar', serverInvites: { RUAN10: 'https://discord.gg/ruanInv' } });
  await flush();
  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].endpoint, '/api/ref');
  assert.equal(page.requests[0].code, 'RUAN10');
  assert.equal(page.requests[0].event, 'visit');
  assert.match(page.requests[0].visitorId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(Object.keys(page.requests[0]).sort(), ['code', 'endpoint', 'event', 'visitorId']);
  assert.deepEqual(page.hrefs(), Array(3).fill('https://discord.gg/ruanInv'));
  assert.equal(page.copy.getAttribute('data-invite'), 'https://discord.gg/ruanInv');
  assert.equal(page.inviteText.textContent, 'discord.gg/ruanInv');
  const saved = JSON.parse(page.store.imperium_ref);
  assert.equal(saved.code, 'RUAN10');
  assert.equal(saved.invite, 'https://discord.gg/ruanInv');
  assert.equal(page.location.href, 'https://imperiumblox.shop/?utm=x#entrar');
});

test('?ref inativo ou inexistente: mantém o convite geral e não guarda nada', async () => {
  const page = setup({ url: 'https://imperiumblox.shop/?ref=SUMIU' });
  await flush();
  assert.equal(page.requests.length, 1);
  assert.deepEqual(page.hrefs(), [GENERAL, GENERAL, GENERAL]);
  assert.equal(page.store.imperium_ref, undefined);
  assert.equal(page.location.href, 'https://imperiumblox.shop/');
});

test('?ref malformado: nem consulta o servidor', async () => {
  const page = setup({ url: 'https://imperiumblox.shop/?ref=%3Cscript%3E' });
  await flush();
  assert.equal(page.requests.length, 0);
  assert.deepEqual(page.hrefs(), [GENERAL, GENERAL, GENERAL]);
  assert.equal(page.location.href, 'https://imperiumblox.shop/');
});

test('servidor fora do ar: continua com o convite geral', async () => {
  const page = setup({ url: 'https://imperiumblox.shop/?ref=RUAN10', failFetch: true });
  await flush();
  assert.deepEqual(page.hrefs(), [GENERAL, GENERAL, GENERAL]);
  assert.equal(page.store.imperium_ref, undefined);
});

test('convite fora do formato vindo do servidor é ignorado', async () => {
  const page = setup({ url: 'https://imperiumblox.shop/?ref=RUAN10', serverInvites: { RUAN10: 'javascript:alert(1)' } });
  await flush();
  assert.deepEqual(page.hrefs(), [GENERAL, GENERAL, GENERAL]);
});

test('retorno dentro de 30 dias: aplica o convite na hora e reconfirma sem registrar visita', async () => {
  const storage = { imperium_ref: JSON.stringify({ code: 'RUAN10', invite: 'https://discord.gg/old', ts: Date.now() - 5 * DAY }) };
  const page = setup({ storage, serverInvites: { RUAN10: 'https://discord.gg/novo' } });
  assert.deepEqual(page.hrefs(), Array(3).fill('https://discord.gg/old'));
  await flush();
  assert.equal(page.requests[0].event, null);
  assert.deepEqual(page.hrefs(), Array(3).fill('https://discord.gg/novo'));
  assert.equal(JSON.parse(page.store.imperium_ref).invite, 'https://discord.gg/novo');
});

test('afiliado desativado depois: volta ao convite geral e apaga a atribuição', async () => {
  const storage = { imperium_ref: JSON.stringify({ code: 'RUAN10', invite: 'https://discord.gg/old', ts: Date.now() - DAY }) };
  const page = setup({ storage });
  await flush();
  assert.deepEqual(page.hrefs(), [GENERAL, GENERAL, GENERAL]);
  assert.equal(page.inviteText.textContent, 'discord.gg/B7EYXPQndC');
  assert.equal(page.copy.getAttribute('data-invite'), null);
  assert.equal(page.store.imperium_ref, undefined);
});

test('falha de rede no retorno mantém a atribuição guardada', async () => {
  const storage = { imperium_ref: JSON.stringify({ code: 'RUAN10', invite: 'https://discord.gg/old', ts: Date.now() - DAY }) };
  const page = setup({ storage, failFetch: true });
  await flush();
  assert.deepEqual(page.hrefs(), Array(3).fill('https://discord.gg/old'));
  assert.ok(page.store.imperium_ref);
});

test('atribuição com mais de 30 dias é descartada', async () => {
  const storage = { imperium_ref: JSON.stringify({ code: 'RUAN10', invite: 'https://discord.gg/old', ts: Date.now() - 31 * DAY }) };
  const page = setup({ storage, serverInvites: { RUAN10: 'https://discord.gg/old' } });
  await flush();
  assert.deepEqual(page.hrefs(), [GENERAL, GENERAL, GENERAL]);
  assert.equal(page.requests.length, 0);
  assert.equal(page.store.imperium_ref, undefined);
});

test('último clique: um novo ?ref ativo substitui o anterior', async () => {
  const storage = { imperium_ref: JSON.stringify({ code: 'ANTIGO', invite: 'https://discord.gg/antigo', ts: Date.now() - DAY }) };
  const page = setup({ url: 'https://imperiumblox.shop/?ref=NOVO', storage, serverInvites: { NOVO: 'https://discord.gg/novo', ANTIGO: 'https://discord.gg/antigo' } });
  await flush();
  assert.deepEqual(page.hrefs(), Array(3).fill('https://discord.gg/novo'));
  assert.equal(JSON.parse(page.store.imperium_ref).code, 'NOVO');
});

test('cliques no Discord e em Copiar convite registram clique; outros cliques não', async () => {
  const page = setup({ url: 'https://imperiumblox.shop/?ref=RUAN10', serverInvites: { RUAN10: 'https://discord.gg/ruanInv' } });
  await flush();
  page.click(page.links[1]);
  page.click(page.copy);
  page.click(element({ href: '#dominios' }));
  const sent = await page.beaconPayloads();
  assert.equal(sent.length, 2);
  for (const p of sent) {
    assert.equal(p.code, 'RUAN10');
    assert.equal(p.event, 'click');
    assert.equal(p.visitorId, page.requests[0].visitorId);
  }
  assert.ok(page.beacons.every((b) => b.endpoint === '/api/ref'));
});
