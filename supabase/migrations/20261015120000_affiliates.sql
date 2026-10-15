-- Afiliados (MVP): cada afiliado tem nome, código único, convite exclusivo do
-- Discord e status. A landing troca o convite geral pelo do afiliado quando o
-- visitante chega com ?ref=CODIGO e registra visitas e cliques anônimos.
--
-- Privacidade: os eventos guardam só um visitor_id aleatório gerado no navegador.
-- Nada de IP, user agent ou referrer.
--
-- Acesso: anon não lê nem escreve nada. A landing passa pelo /api/ref, que usa a
-- service_role para chamar referral_hit. O painel usa usuários em admin_users.

-- ---------------------------------------------------------------- admins

create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

-- ---------------------------------------------------------------- tabelas

create table public.affiliates (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (length(btrim(name)) between 1 and 120),
  code                text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  -- formato fixo: o valor vira href na landing, então nada além de um convite discord.gg
  discord_invite_url  text not null check (discord_invite_url ~ '^https://discord\.gg/[A-Za-z0-9-]{2,32}$'),
  discord_invite_code text generated always as (substring(discord_invite_url from '^https://discord\.gg/(.+)$')) stored,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.referral_events (
  id           bigint generated always as identity primary key,
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  event_type   text not null check (event_type in ('visit', 'click')),
  visitor_id   uuid not null,
  created_at   timestamptz not null default now()
);

create index referral_events_affiliate_time on public.referral_events (affiliate_id, created_at desc);
create index referral_events_visitor_time   on public.referral_events (visitor_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger affiliates_set_updated_at
  before update on public.affiliates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- landing

-- Devolve o convite do afiliado se o código estiver ativo (senão null) e, se
-- p_event vier preenchido, registra o evento. Visitas repetidas do mesmo
-- visitante contam uma vez a cada 30 minutos; cada visitante tem no máximo
-- 30 eventos a cada 10 minutos.
create or replace function public.referral_hit(
  p_code       text,
  p_visitor_id uuid,
  p_event      text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_invite text;
begin
  if not coalesce(p_code ~ '^[A-Z0-9_-]{3,32}$', false) then
    return null;
  end if;

  select a.id, a.discord_invite_url into v_id, v_invite
  from public.affiliates a
  where a.code = p_code and a.active;

  if v_id is null
     or p_event is null
     or p_event not in ('visit', 'click')
     or p_visitor_id is null then
    return v_invite;
  end if;

  if (select count(*) from public.referral_events e
      where e.visitor_id = p_visitor_id
        and e.created_at > now() - interval '10 minutes') >= 30 then
    return v_invite;
  end if;

  if p_event = 'visit' and exists (
    select 1 from public.referral_events e
    where e.visitor_id = p_visitor_id
      and e.affiliate_id = v_id
      and e.event_type = 'visit'
      and e.created_at > now() - interval '30 minutes'
  ) then
    return v_invite;
  end if;

  insert into public.referral_events (affiliate_id, event_type, visitor_id)
  values (v_id, p_event, p_visitor_id);

  return v_invite;
end;
$$;

-- ---------------------------------------------------------------- painel

-- Totais por afiliado no período (null = sem limite). Roda com as permissões
-- de quem chama, então só devolve linhas para admins (RLS).
create or replace function public.affiliate_stats(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns table (
  affiliate_id    uuid,
  visits          bigint,
  unique_visitors bigint,
  clicks          bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id,
         count(e.id) filter (where e.event_type = 'visit'),
         count(distinct e.visitor_id) filter (where e.event_type = 'visit'),
         count(e.id) filter (where e.event_type = 'click')
  from public.affiliates a
  left join public.referral_events e
         on e.affiliate_id = a.id
        and (p_from is null or e.created_at >= p_from)
        and (p_to is null or e.created_at < p_to)
  group by a.id;
$$;

-- ---------------------------------------------------------------- permissões

alter table public.admin_users     enable row level security;
alter table public.affiliates      enable row level security;
alter table public.referral_events enable row level security;

revoke all on public.admin_users, public.affiliates, public.referral_events from anon;
revoke insert, update, delete on public.admin_users from authenticated;
revoke insert, update on public.referral_events from authenticated;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.affiliate_stats(timestamptz, timestamptz) from public, anon;
revoke execute on function public.referral_hit(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.affiliate_stats(timestamptz, timestamptz) to authenticated;
grant execute on function public.referral_hit(text, uuid, text) to service_role;

create policy "admin_users: admin lê"
  on public.admin_users for select to authenticated
  using ((select public.is_admin()));

create policy "affiliates: admin gerencia"
  on public.affiliates for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "referral_events: admin lê"
  on public.referral_events for select to authenticated
  using ((select public.is_admin()));

create policy "referral_events: admin apaga"
  on public.referral_events for delete to authenticated
  using ((select public.is_admin()));
