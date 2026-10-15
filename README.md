# Imperium

Landing da Imperium, comunidade e loja de Volleyball Legends no Discord, publicada em [imperiumblox.shop](https://imperiumblox.shop/), e painel de afiliados em `/admin`.

A landing é estática, sem build. O painel e o rastreamento usam Supabase e duas funções serverless da Vercel, sem dependências npm.

## Estrutura

```
public/                    único diretório servido pela Vercel
  index.html               landing
  assets/css/styles.css
  assets/js/main.js        interações da landing (header, lightbox, copiar convite, barra mobile)
  assets/js/ref.js         afiliados: ?ref=CODIGO → convite exclusivo do Discord
  prova-1..5.webp
  admin/                   painel de afiliados (login de administrador)
api/
  ref.js                   POST /api/ref
  public-config.js         GET  /api/public-config
  _lib/                    código compartilhado (não vira rota)
supabase/migrations/       tabelas, funções e políticas RLS
tests/                     testes (node --test)
vercel.json                diretório de saída, cache e headers de segurança do /admin
```

## Como funcionam os afiliados

1. Cada afiliado tem nome, código único (`A-Z`, `0-9`, `-`, `_`), convite exclusivo `https://discord.gg/...` e status ativo/inativo.
2. O afiliado divulga `https://imperiumblox.shop/?ref=CODIGO`.
3. O `ref.js` pergunta ao `/api/ref` se o código está ativo. Se estiver, guarda código e convite no `localStorage` por 30 dias (vale o último código válido), registra uma visita e troca o convite de todos os botões “Entrar no Discord”, do texto da tessera e do “Copiar convite”.
4. Sem `?ref` válido (ou com afiliado inativo, inexistente ou servidor fora do ar), a landing fica exatamente como antes, com o convite geral.
5. Nas visitas seguintes, o convite guardado é aplicado na hora e reconfirmado no servidor; se o afiliado foi desativado, volta o convite geral.
6. Cliques em “Entrar no Discord” e “Copiar convite” durante a atribuição contam como clique.

Os eventos guardam apenas um `visitor_id` aleatório gerado no navegador. Não há IP, user agent nem referrer.

### `POST /api/ref`

Corpo (`text/plain` ou JSON): `{ "code": "RUAN10", "visitorId": "<uuid>", "event": "visit" | "click" | null }`

Resposta: `{ "invite": "https://discord.gg/..." }` para afiliado ativo e `{ "invite": null }` em qualquer outro caso (inexistente, inativo, malformado ou erro), sempre com status 200. Só aceita origens listadas em `ALLOWED_ORIGINS` (403) e o método POST (405). O banco limita cada visitante a 30 eventos por 10 minutos e conta uma visita por visitante e afiliado a cada 30 minutos.

## Configuração

### Supabase

1. Crie o projeto (região sugerida: São Paulo, `sa-east-1`).
2. Rode `supabase/migrations/20261015120000_affiliates.sql` no SQL Editor (ou `supabase db push`).
3. Em **Authentication → Sign In / Providers**, desative **Allow new users to sign up**.
4. Em **Authentication → Users**, crie o usuário administrador com email e senha.
5. No SQL Editor, dê acesso ao painel:
   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'SEU-EMAIL';
   ```
6. Em **Authentication → URL Configuration**, use `https://imperiumblox.shop` como Site URL.
7. Em **Project Settings → API Keys**, copie a chave publicável (`sb_publishable_...`) e crie/copie uma chave secreta (`sb_secret_...`).

### Vercel

1. Importe o repositório com o preset **Other**, sem comando de build. O `vercel.json` já define `public` como diretório de saída.
2. Cadastre as variáveis de `.env.example` em **Settings → Environment Variables**:

   | Variável | Uso |
   |---|---|
   | `SUPABASE_URL` | URL do projeto |
   | `SUPABASE_ANON_KEY` | chave publicável (`sb_publishable_...`); o painel recebe pelo `/api/public-config` e a RLS protege os dados |
   | `SUPABASE_SERVICE_ROLE_KEY` | chave secreta (`sb_secret_...`); usada só pelo `/api/ref`, nunca exposta ao navegador |

   Os nomes são os antigos do Supabase, mas os valores devem ser as chaves atuais. Chaves JWT legadas também funcionam.
   | `ALLOWED_ORIGINS` | origens aceitas pelo `/api/ref`, separadas por vírgula |

3. Se usar um domínio próprio no Supabase (fora de `*.supabase.co`), inclua-o no `connect-src` do `Content-Security-Policy` do `/admin` no `vercel.json`.

## Testes

```bash
node --test tests/
```

Cobre o `/api/ref` (origens, respostas idênticas para códigos inválidos, formato do convite) e o `ref.js` (troca de convites, 30 dias, último clique, desativação, cliques).

## Rodar localmente

Só a landing (sem afiliados):

```bash
python -m http.server 8000 --directory public
```

Com as funções, use `vercel dev` com um `.env.local` baseado no `.env.example`.
