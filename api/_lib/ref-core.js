// Lógica do POST /api/ref, sem dependência do Supabase (a consulta é injetada),
// para poder ser testada isoladamente.

export const CODE_RE = /^[A-Z0-9_-]{3,32}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const INVITE_RE = /^https:\/\/discord\.gg\/[A-Za-z0-9-]{2,32}$/;
export const EVENTS = new Set(['visit', 'click']);
export const MAX_BODY_BYTES = 1024;

export function parseOrigins(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  );
}

// Devolve a requisição normalizada ou null se o formato for inválido.
// Se o código existe e está ativo, quem decide é o banco.
export function parseRequest(body) {
  let data = body;
  if (typeof data === 'string') {
    if (data.length > MAX_BODY_BYTES) return null;
    try { data = JSON.parse(data); } catch { return null; }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const code = typeof data.code === 'string' ? data.code.trim().toUpperCase() : '';
  if (!CODE_RE.test(code)) return null;

  const visitorId = typeof data.visitorId === 'string' && UUID_RE.test(data.visitorId) ? data.visitorId.toLowerCase() : null;
  const event = EVENTS.has(data.event) && visitorId ? data.event : null;

  return { code, visitorId, event };
}

async function readBody(req) {
  // Na Vercel o corpo já vem em req.body (string para text/plain, objeto para JSON).
  if (req.body !== undefined) {
    return Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// A página do próprio site (mesmo host que recebeu a requisição, seja o domínio
// principal ou um Preview) sempre pode chamar; a lista extra serve para liberar
// outros domínios, como o www quando ele não redireciona.
export function isAllowedOrigin(origin, host, extra) {
  if (!origin) return false;
  let url;
  try { url = new URL(origin); } catch { return false; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (host && url.host.toLowerCase() === String(host).toLowerCase()) return true;
  return extra.has(url.origin);
}

// lookup({ code, visitorId, event }) devolve o convite do afiliado ativo ou null.
export function createRefHandler({ lookup, allowedOrigins, log = console.error }) {
  const origins = allowedOrigins instanceof Set ? allowedOrigins : parseOrigins(allowedOrigins);

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.statusCode = 405;
      return res.end();
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (!isAllowedOrigin(req.headers.origin, host, origins)) {
      res.statusCode = 403;
      return res.end();
    }

    let invite = null;
    try {
      const request = parseRequest(await readBody(req));
      if (request) {
        const found = await lookup(request);
        invite = typeof found === 'string' && INVITE_RE.test(found) ? found : null;
      }
    } catch (err) {
      log('ref: falha ao consultar afiliado', err && err.message ? err.message : err);
    }

    // Erro, código inválido, inexistente ou inativo: todos recebem { invite: null }.
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ invite }));
  };
}
