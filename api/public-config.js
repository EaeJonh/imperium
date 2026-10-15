// GET /api/public-config — URL e chave publicável do Supabase para o painel /admin.
// A chave publicável é pública por natureza; o acesso aos dados é controlado pela RLS.

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    return res.end();
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!supabaseUrl || !supabasePublishableKey) {
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'Supabase não configurado' }));
  }

  res.setHeader('Cache-Control', 'public, max-age=300');
  res.statusCode = 200;
  return res.end(JSON.stringify({ supabaseUrl, supabasePublishableKey }));
}
