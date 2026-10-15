import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createRefHandler, parseRequest } from '../api/_lib/ref-core.js';

const ORIGIN = 'https://imperiumblox.shop';
const VISITOR = '4f9c2b8e-1d3a-4c5e-9f7a-2b6d8e0c1a3f';

function request({ method = 'POST', origin = ORIGIN, body } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  req.method = method;
  req.headers = origin ? { origin } : {};
  return req;
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(chunk) { if (chunk) this.body += chunk; },
  };
}

function handlerWith(lookup) {
  const calls = [];
  const handler = createRefHandler({
    allowedOrigins: `${ORIGIN}, https://www.imperiumblox.shop/`,
    lookup: async (req) => { calls.push(req); return lookup(req); },
    log: () => {},
  });
  return { handler, calls };
}

async function run(handler, opts) {
  const res = response();
  await handler(request(opts), res);
  return res;
}

const body = (data) => JSON.stringify(data);

test('recusa métodos diferentes de POST', async () => {
  const { handler, calls } = handlerWith(() => null);
  const res = await run(handler, { method: 'GET' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
  assert.equal(calls.length, 0);
});

test('recusa origem não permitida ou ausente', async () => {
  const { handler, calls } = handlerWith(() => 'https://discord.gg/abc');
  assert.equal((await run(handler, { origin: 'https://evil.example', body: body({ code: 'RUAN10' }) })).statusCode, 403);
  assert.equal((await run(handler, { origin: null, body: body({ code: 'RUAN10' }) })).statusCode, 403);
  assert.equal(calls.length, 0);
});

test('aceita a outra origem configurada, com ou sem barra final', async () => {
  const { handler } = handlerWith(() => 'https://discord.gg/abc');
  const res = await run(handler, { origin: 'https://www.imperiumblox.shop', body: body({ code: 'RUAN10' }) });
  assert.equal(res.statusCode, 200);
});

test('afiliado ativo: devolve o convite e repassa código normalizado, visitante e evento', async () => {
  const { handler, calls } = handlerWith(() => 'https://discord.gg/ruan10x');
  const res = await run(handler, { body: body({ code: ' ruan10 ', visitorId: VISITOR.toUpperCase(), event: 'visit' }) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(JSON.parse(res.body), { invite: 'https://discord.gg/ruan10x' });
  assert.deepEqual(calls, [{ code: 'RUAN10', visitorId: VISITOR, event: 'visit' }]);
});

test('código inexistente, inativo, malformado ou erro: resposta idêntica', async () => {
  const inactive = handlerWith(() => null);
  const broken = handlerWith(() => { throw new Error('db fora'); });
  const responses = [
    await run(inactive.handler, { body: body({ code: 'NAOEXISTE', visitorId: VISITOR, event: 'visit' }) }),
    await run(inactive.handler, { body: body({ code: 'x', visitorId: VISITOR, event: 'visit' }) }),
    await run(inactive.handler, { body: 'não é json' }),
    await run(broken.handler, { body: body({ code: 'RUAN10', visitorId: VISITOR, event: 'visit' }) }),
  ];
  for (const res of responses) {
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, '{"invite":null}');
    assert.deepEqual(res.headers, responses[0].headers);
  }
  // o código malformado e o corpo inválido nem chegam ao banco
  assert.equal(inactive.calls.length, 1);
});

test('nunca repassa um convite fora do formato discord.gg', async () => {
  for (const bad of ['javascript:alert(1)', 'https://evil.example/x', 'https://discord.gg/a b', '', 42]) {
    const { handler } = handlerWith(() => bad);
    const res = await run(handler, { body: body({ code: 'RUAN10' }) });
    assert.equal(res.body, '{"invite":null}');
  }
});

test('evento só vale com visitorId válido; eventos desconhecidos viram consulta sem registro', async () => {
  assert.deepEqual(parseRequest({ code: 'ABC', event: 'visit' }), { code: 'ABC', visitorId: null, event: null });
  assert.deepEqual(parseRequest({ code: 'ABC', visitorId: 'nope', event: 'click' }), { code: 'ABC', visitorId: null, event: null });
  assert.deepEqual(parseRequest({ code: 'ABC', visitorId: VISITOR, event: 'purchase' }), { code: 'ABC', visitorId: VISITOR, event: null });
  assert.deepEqual(parseRequest({ code: 'ABC', visitorId: VISITOR, event: 'click' }), { code: 'ABC', visitorId: VISITOR, event: 'click' });
});

test('ignora corpo grande demais e formatos estranhos', async () => {
  assert.equal(parseRequest('x'.repeat(2000)), null);
  assert.equal(parseRequest('[]'), null);
  assert.equal(parseRequest(null), null);
  assert.equal(parseRequest({ code: 'TEM ESPAÇO' }), null);
  assert.equal(parseRequest({ code: 'A'.repeat(33) }), null);
});

test('lê corpo já interpretado pela Vercel (string ou objeto)', async () => {
  const { handler, calls } = handlerWith(() => 'https://discord.gg/abc');
  for (const parsed of [body({ code: 'ABC' }), { code: 'ABC' }]) {
    const req = request({ body: undefined });
    req.body = parsed;
    const res = response();
    await handler(req, res);
    assert.equal(res.body, '{"invite":"https://discord.gg/abc"}');
  }
  assert.equal(calls.length, 2);
});
