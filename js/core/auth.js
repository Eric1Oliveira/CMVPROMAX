/**
 * CMV Pro — Autenticação (dual: Supabase Auth ou local)
 * -----------------------------------------------------
 * Com js/config.js preenchido, usa o Supabase Auth de verdade (e-mail/senha,
 * confirmação de e-mail, recuperação por link). Sem configuração, roda o
 * modo local (localStorage + conta demo) com o MESMO contrato.
 *
 * A sessão é mantida em cache síncrono (variável `current`) para o router
 * poder proteger rotas sem await: chame initAuth() uma vez no bootstrap.
 *
 * Formato da sessão: { userId, name, email, role, empresaId, expiresAt }
 */

import { bus } from './events.js';
import { uid } from '../utils/uid.js';
import { isSupabaseConfigured } from '../config.js';
import { getSupabase } from '../services/supabase-client.js';

const USERS_KEY = 'cmvpro:users';       // modo local
const SESSION_KEY = 'cmvpro:session';   // modo local
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Sessão ativa em memória (cache síncrono para o router). */
let current = null;

/** Retorna a sessão ativa (ou null). Síncrono — alimentado por initAuth. */
export function getSession() {
  return current;
}

/** Empresa do usuário logado (usada pelo backend de dados do Supabase). */
export function getEmpresaId() {
  return current?.empresaId ?? null;
}

/* ========================================================================
   MODO SUPABASE
   ===================================================================== */

/**
 * Auto-provisionamento (plano B do trigger handle_new_user): contas criadas
 * antes do schema não têm empresa/perfil — o app cria os dois na hora.
 * Requer as políticas empresas_insert/profiles_insert (schema.sql § 6).
 */
async function selfProvision(sb, user) {
  try {
    const meta = user.user_metadata ?? {};
    const empresaId = uid();

    // insert sem .select(): o RETURNING exigiria SELECT que só passa a valer
    // depois que o perfil existir — por isso o refetch separado no final.
    const e1 = await sb.from('empresas').insert({
      id: empresaId,
      nome: meta.empresa || 'Meu Negócio',
    });
    if (e1.error) throw e1.error;

    const e2 = await sb.from('profiles').insert({
      userId: user.id,
      empresaId,
      nome: meta.nome || user.email.split('@')[0],
      email: user.email,
      role: 'owner',
    });
    if (e2.error) throw e2.error;

    const { data } = await sb.from('profiles').select('*')
      .eq('userId', user.id).maybeSingle();
    console.info('[auth] conta sem perfil — empresa provisionada automaticamente.');
    return data;
  } catch (err) {
    console.error('[auth] auto-provisionamento falhou (rode supabase/fix-perfis.sql):', err);
    return null;
  }
}

/** Monta a sessão do app a partir do usuário do Supabase + profile. */
async function buildSupabaseSession(sbSession) {
  if (!sbSession?.user) return null;
  const sb = await getSupabase();
  let { data: profile, error } = await sb
    .from('profiles')
    .select('*')
    .eq('userId', sbSession.user.id)
    .maybeSingle();
  if (error) console.error('[auth] falha ao carregar profile:', error);

  // Conta sem perfil (criada antes do schema / trigger falhou): repara agora.
  if (!profile && !error) {
    profile = await selfProvision(sb, sbSession.user);
  }

  return {
    userId: sbSession.user.id,
    name: profile?.nome ?? sbSession.user.email.split('@')[0],
    email: sbSession.user.email,
    role: profile?.role ?? 'owner',
    empresaId: profile?.empresaId ?? null,
    expiresAt: (sbSession.expires_at ?? 0) * 1000,
  };
}

const supabaseAuth = {
  async signUp({ name, email, password }) {
    const sb = await getSupabase();
    const { data, error } = await sb.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      // metadata lido pelo trigger handle_new_user (cria empresa + profile)
      options: { data: { nome: name.trim() } },
    });
    if (error) throw new Error(traduz(error.message));
    if (!data.session) return { needsConfirm: true }; // projeto exige confirmação
    current = await buildSupabaseSession(data.session);
    bus.emit('auth:changed', { session: current });
    return { needsConfirm: false };
  },

  async signIn({ email, password }) {
    const sb = await getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw new Error(traduz(error.message));
    current = await buildSupabaseSession(data.session);
    bus.emit('auth:changed', { session: current });
    return current;
  },

  async signOut() {
    const sb = await getSupabase();
    await sb.auth.signOut();
    current = null;
    bus.emit('auth:changed', { session: null });
  },

  async recover(email) {
    const sb = await getSupabase();
    // O link do e-mail volta para o app; o evento PASSWORD_RECOVERY abre o
    // modal de nova senha (ver initAuth/main.js).
    const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: location.origin + location.pathname,
    });
    if (error) throw new Error(traduz(error.message));
    return { ok: true };
  },

  async completeRecovery(newPassword) {
    const sb = await getSupabase();
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw new Error(traduz(error.message));
    return { ok: true };
  },

  /** Troca de senha do usuário logado (Perfil). */
  async changePassword(newPassword) {
    return supabaseAuth.completeRecovery(newPassword);
  },

  /** Membros da empresa (profiles visíveis pelo RLS). */
  async listMembers() {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .order('createdAt', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => ({
      userId: p.userId,
      nome: p.nome,
      email: p.email,
      role: p.role,
      createdAt: p.createdAt,
      atual: p.userId === current?.userId,
    }));
  },

  async updateProfile(patch) {
    const sb = await getSupabase();
    if (patch.name) {
      const { error } = await sb
        .from('profiles')
        .update({ nome: patch.name })
        .eq('userId', current.userId);
      if (error) throw new Error(error.message);
      current = { ...current, name: patch.name };
      bus.emit('auth:changed', { session: current });
    }
    return current;
  },

  async signInDemo() {
    throw new Error('A conta demo está disponível apenas no modo local (sem Supabase).');
  },
};

/** Traduz as mensagens mais comuns do Supabase Auth. */
function traduz(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered')) return 'Já existe uma conta com este e-mail.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar (verifique a caixa de entrada).';
  if (m.includes('password should be')) return 'A senha precisa de pelo menos 8 caracteres.';
  if (m.includes('rate limit')) return 'Muitas tentativas — aguarde alguns minutos.';
  if (m.includes('failed to fetch')) return 'Sem conexão com o servidor. Verifique sua internet.';
  return msg;
}

/* ========================================================================
   MODO LOCAL (localStorage) — desenvolvimento e demo
   ===================================================================== */

function readUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) ?? []; }
  catch { return []; }
}
function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function hashPassword(password, salt) {
  const input = `${salt}:${password}`;
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return `djb2_${h.toString(16)}`;
}

function persistLocalSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  current = session;
  bus.emit('auth:changed', { session });
  return session;
}

const localAuth = {
  async signUp({ name, email, password }) {
    email = email.trim().toLowerCase();
    const users = readUsers();
    if (users.some((u) => u.email === email)) {
      throw new Error('Já existe uma conta com este e-mail.');
    }
    const salt = uid();
    const user = {
      id: uid(), name: name.trim(), email, salt,
      passwordHash: await hashPassword(password, salt),
      role: 'owner', createdAt: new Date().toISOString(),
    };
    users.push(user);
    writeUsers(users);
    persistLocalSession({
      userId: user.id, name: user.name, email, role: 'owner',
      empresaId: 'local', expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return { needsConfirm: false };
  },

  async signIn({ email, password }) {
    email = email.trim().toLowerCase();
    const user = readUsers().find((u) => u.email === email);
    if (!user) throw new Error('E-mail ou senha incorretos.');
    if ((await hashPassword(password, user.salt)) !== user.passwordHash) {
      throw new Error('E-mail ou senha incorretos.');
    }
    return persistLocalSession({
      userId: user.id, name: user.name, email, role: user.role ?? 'owner',
      empresaId: 'local', expiresAt: Date.now() + SESSION_TTL_MS,
    });
  },

  async signOut() {
    localStorage.removeItem(SESSION_KEY);
    current = null;
    bus.emit('auth:changed', { session: null });
  },

  async recover() {
    return { ok: true }; // no modo local não há e-mail; a UI orienta o usuário
  },

  async completeRecovery() {
    return { ok: true };
  },

  /** Troca de senha local: gera novo salt + hash para o usuário atual. */
  async changePassword(newPassword) {
    const users = readUsers();
    const user = users.find((u) => u.id === current?.userId);
    if (!user) throw new Error('Usuário não encontrado.');
    user.salt = uid();
    user.passwordHash = await hashPassword(newPassword, user.salt);
    writeUsers(users);
    return { ok: true };
  },

  /** Contas locais deste dispositivo (modo demo/desenvolvimento). */
  async listMembers() {
    return readUsers().map((u) => ({
      userId: u.id,
      nome: u.name,
      email: u.email,
      role: u.role ?? 'owner',
      createdAt: u.createdAt,
      atual: u.id === current?.userId,
    }));
  },

  async updateProfile(patch) {
    const users = readUsers();
    const user = users.find((u) => u.id === current?.userId);
    if (!user) throw new Error('Usuário não encontrado.');
    if (patch.name) user.name = patch.name;
    writeUsers(users);
    return persistLocalSession({ ...current, name: user.name });
  },

  async signInDemo() {
    const email = 'demo@cmvpro.app';
    const users = readUsers();
    if (!users.some((u) => u.email === email)) {
      const salt = uid();
      users.push({
        id: uid(), name: 'Chef Demo', email, salt,
        passwordHash: await hashPassword('demo1234', salt),
        role: 'owner', createdAt: new Date().toISOString(),
      });
      writeUsers(users);
    }
    return localAuth.signIn({ email, password: 'demo1234' });
  },
};

/* ========================================================================
   API pública
   ===================================================================== */

export const auth = isSupabaseConfigured() ? supabaseAuth : localAuth;

/** O modo local está ativo (sem Supabase)? Usado pela UI (botão demo etc.) */
export const isLocalMode = () => !isSupabaseConfigured();

/**
 * Inicializa a sessão ANTES do router (main.js aguarda esta promise).
 * No Supabase, também observa mudanças de auth (refresh de token, logout em
 * outra aba, link de recuperação de senha).
 */
export async function initAuth() {
  if (isSupabaseConfigured()) {
    const sb = await getSupabase();
    const { data } = await sb.auth.getSession();
    current = await buildSupabaseSession(data.session);

    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        current = await buildSupabaseSession(session);
        bus.emit('auth:recovery'); // main.js abre o modal de nova senha
        return;
      }
      if (event === 'SIGNED_OUT') {
        current = null;
        bus.emit('auth:changed', { session: null });
        return;
      }
      if (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
        current = await buildSupabaseSession(session);
      }
    });
    return current;
  }

  /* modo local: restaura sessão do localStorage (com expiração) */
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (s && Date.now() < s.expiresAt) {
      current = { empresaId: 'local', ...s };
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch { current = null; }
  return current;
}
