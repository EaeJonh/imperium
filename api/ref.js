// POST /api/ref — resolve o convite do Discord de um afiliado e registra o evento.
// Corpo: { code, visitorId, event?: 'visit' | 'click' }
// Resposta: { invite: "https://discord.gg/..." } para afiliado ativo, { invite: null } em qualquer outro caso.

import { createRefHandler } from './_lib/ref-core.js';
import { callRpc } from './_lib/supabase-rest.js';

export default createRefHandler({
  allowedOrigins: process.env.ALLOWED_ORIGINS,
  lookup: ({ code, visitorId, event }) =>
    callRpc('referral_hit', { p_code: code, p_visitor_id: visitorId, p_event: event }),
});
