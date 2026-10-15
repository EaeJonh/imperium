// GET /api/public-config — URL e chave pública (anon) do Supabase para o painel /admin.
// A chave anon é pública por natureza; o acesso aos dados é controlado pela RLS.

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    return res.end();
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!supabaseUrl || !supabaseAnonKey) {
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'Supabase não configurado' }));
  }

  res.setHeader('Cache-Control', 'public, max-age=300');
  res.statusCode = 200;
  return res.end(JSON.stringify({ supabaseUrl, supabaseAnonKey }));
}
