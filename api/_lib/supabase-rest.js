// Chamada mínima à API REST do Supabase (PostgREST), sem SDK.
// Usa a chave secreta (papel service_role no banco): só pode ser importado por funções do servidor.

export async function callRpc(name, args, { url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl = fetch } = {}) {
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas');

  const headers = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
  // chaves sb_secret_ vão só no apikey; Authorization: Bearer apenas para chaves JWT legadas
  if (key.split('.').length === 3) headers.Authorization = `Bearer ${key}`;

  const res = await fetchImpl(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`rpc ${name} respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}
