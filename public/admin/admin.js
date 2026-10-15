// Painel de afiliados. Todo acesso a dados passa pela RLS do Supabase:
// só usuários presentes em admin_users conseguem ler ou alterar algo.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

const CODE_RE = /^[A-Z0-9_-]{3,32}$/;
const $ = (s) => document.querySelector(s);

const ui = {
  notice: $('#notice'),
  login: $('#login-view'),
  loginForm: $('#login-form'),
  loginError: $('#login-error'),
  app: $('#app-view'),
  userBox: $('#user-box'),
  userEmail: $('#user-email'),
  form: $('#affiliate-form'),
  formTitle: $('#form-title'),
  formError: $('#form-error'),
  save: $('#save'),
  cancel: $('#cancel-edit'),
  period: $('#period'),
  body: $('#affiliates-body'),
};

let supabase;
let affiliates = [];

// ---------- utilitários

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c instanceof Node ? c : document.createTextNode(String(c ?? '')));
  return node;
}

function show(node, visible) { node.hidden = !visible; }

function notify(message, bad = false) {
  ui.notice.textContent = message;
  ui.notice.classList.toggle('bad', bad);
  show(ui.notice, true);
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => show(ui.notice, false), 4000);
}

// aceita discord.gg/X, discord.com/invite/X (com ou sem https://) e devolve https://discord.gg/X
function normalizeInvite(value) {
  const m = String(value || '').trim().match(/^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})\/?$/i);
  return m ? `https://discord.gg/${m[1]}` : null;
}

function publicLink(code) {
  return `${location.origin}/?ref=${encodeURIComponent(code)}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    notify(`Link copiado: ${text}`);
  } catch {
    window.prompt('Copie o link:', text);
  }
}

function friendlyError(error) {
  if (!error) return 'Erro desconhecido.';
  if (error.code === '23505') return 'Já existe um afiliado com esse código.';
  if (error.code === '23514') return 'Algum campo está fora do formato permitido.';
  if (error.code === '42501') return 'Sem permissão para essa ação.';
  return error.message || 'Erro ao falar com o servidor.';
}

// ---------- sessão

async function enterApp(session) {
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error || !isAdmin) {
    await supabase.auth.signOut();
    showLogin('Esta conta não tem acesso ao painel.');
    return;
  }
  ui.userEmail.textContent = session.user.email || '';
  show(ui.userBox, true);
  show(ui.login, false);
  show(ui.app, true);
  await loadAffiliates();
}

function showLogin(message) {
  show(ui.app, false);
  show(ui.userBox, false);
  show(ui.login, true);
  ui.loginError.textContent = message || '';
  show(ui.loginError, Boolean(message));
}

ui.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = ui.loginForm.querySelector('button');
  button.disabled = true;
  show(ui.loginError, false);
  const fd = new FormData(ui.loginForm);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(fd.get('email')).trim(),
    password: String(fd.get('password')),
  });
  button.disabled = false;
  if (error) return showLogin('Email ou senha inválidos.');
  ui.loginForm.reset();
  await enterApp(data.session);
});

$('#logout').addEventListener('click', async () => {
  await supabase.auth.signOut();
  affiliates = [];
  ui.body.replaceChildren();
  showLogin();
});

// ---------- listagem

function periodStart() {
  const days = Number(ui.period.value);
  return days ? new Date(Date.now() - days * 864e5).toISOString() : null;
}

async function loadAffiliates() {
  const [list, stats] = await Promise.all([
    supabase.from('affiliates').select('id, name, code, discord_invite_url, active, created_at').order('created_at', { ascending: false }),
    supabase.rpc('affiliate_stats', { p_from: periodStart(), p_to: null }),
  ]);
  if (list.error || stats.error) {
    notify(friendlyError(list.error || stats.error), true);
    return;
  }
  const byId = new Map(stats.data.map((s) => [s.affiliate_id, s]));
  affiliates = list.data.map((a) => ({ ...a, stats: byId.get(a.id) || { visits: 0, unique_visitors: 0, clicks: 0 } }));
  render();
}

function render() {
  if (!affiliates.length) {
    ui.body.replaceChildren(el('tr', {}, el('td', { class: 'empty', colspan: '8' }, 'Nenhum afiliado cadastrado ainda.')));
    return;
  }
  ui.body.replaceChildren(...affiliates.map((a) => el('tr', {},
    el('td', {}, a.name),
    el('td', {}, el('code', {}, a.code)),
    el('td', {}, el('a', { href: a.discord_invite_url, target: '_blank', rel: 'noopener noreferrer' }, a.discord_invite_url.replace('https://', ''))),
    el('td', {}, el('span', { class: `tag ${a.active ? 'on' : 'off'}` }, a.active ? 'Ativo' : 'Inativo')),
    el('td', { class: 'num' }, a.stats.visits),
    el('td', { class: 'num' }, a.stats.unique_visitors),
    el('td', { class: 'num' }, a.stats.clicks),
    el('td', {}, el('div', { class: 'cell-actions' },
      el('button', { type: 'button', class: 'ghost small', onclick: () => copyText(publicLink(a.code)) }, 'Copiar link'),
      el('button', { type: 'button', class: 'ghost small', onclick: () => startEdit(a) }, 'Editar'),
      el('button', { type: 'button', class: 'ghost small', onclick: (e) => toggleActive(a, e.currentTarget) }, a.active ? 'Desativar' : 'Ativar'),
    )),
  )));
}

ui.period.addEventListener('change', loadAffiliates);

// ---------- criar / editar

function resetForm() {
  ui.form.reset();
  ui.form.elements.id.value = '';
  ui.formTitle.textContent = 'Novo afiliado';
  ui.save.textContent = 'Criar afiliado';
  show(ui.cancel, false);
  show(ui.formError, false);
}

function startEdit(a) {
  ui.form.elements.id.value = a.id;
  ui.form.elements.name.value = a.name;
  ui.form.elements.code.value = a.code;
  ui.form.elements.invite.value = a.discord_invite_url;
  ui.form.elements.active.checked = a.active;
  ui.formTitle.textContent = `Editar ${a.code}`;
  ui.save.textContent = 'Salvar alterações';
  show(ui.cancel, true);
  show(ui.formError, false);
  ui.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  ui.form.elements.name.focus({ preventScroll: true });
}

ui.cancel.addEventListener('click', resetForm);

function formError(message) {
  ui.formError.textContent = message;
  show(ui.formError, true);
}

ui.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = ui.form.elements;
  const name = f.name.value.trim();
  const code = f.code.value.trim().toUpperCase();
  const invite = normalizeInvite(f.invite.value);

  if (!name) return formError('Informe o nome.');
  if (!CODE_RE.test(code)) return formError('Código inválido: use 3 a 32 letras, números, hífen ou sublinhado.');
  if (!invite) return formError('Convite inválido: use um link discord.gg/… ou discord.com/invite/….');

  const row = { name, code, discord_invite_url: invite, active: f.active.checked };
  const id = f.id.value;
  ui.save.disabled = true;
  const { error } = id
    ? await supabase.from('affiliates').update(row).eq('id', id)
    : await supabase.from('affiliates').insert(row);
  ui.save.disabled = false;

  if (error) return formError(friendlyError(error));
  notify(id ? `Afiliado ${code} atualizado.` : `Afiliado ${code} criado. Link: ${publicLink(code)}`);
  resetForm();
  await loadAffiliates();
});

async function toggleActive(a, button) {
  button.disabled = true;
  const { error } = await supabase.from('affiliates').update({ active: !a.active }).eq('id', a.id);
  button.disabled = false;
  if (error) return notify(friendlyError(error), true);
  notify(`${a.code} ${a.active ? 'desativado' : 'ativado'}.`);
  await loadAffiliates();
}

// ---------- início

async function start() {
  let config;
  try {
    const res = await fetch('/api/public-config', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    config = await res.json();
  } catch {
    notify('Não foi possível carregar a configuração do painel.', true);
    return;
  }

  supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') showLogin();
  });

  const { data } = await supabase.auth.getSession();
  if (data.session) await enterApp(data.session);
  else showLogin();
}

start();
