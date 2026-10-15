// Chamada mínima à API REST do Supabase (PostgREST), sem SDK.
// Usa a service role: só pode ser importado por funções do servidor.

export async function callRpc(name, args, { url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl = fetch } = {}) {
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas');

  const res = await fetchImpl(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`rpc ${name} respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}
