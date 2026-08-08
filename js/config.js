/**
 * CMV Pro — Configuração do ambiente
 * ----------------------------------
 * ⚡ CONECTAR AO SUPABASE:
 *   1. Rode supabase/schema.sql no SQL Editor do seu projeto.
 *   2. Em Settings → API, copie a "Project URL" e a chave "anon public".
 *   3. Preencha as duas constantes abaixo e recarregue o app.
 *
 * Sem as chaves preenchidas, o app roda em MODO LOCAL (localStorage +
 * conta demo) — útil para desenvolvimento e demonstrações offline.
 *
 * A chave anon é pública por design: a segurança real vem das políticas
 * RLS criadas pelo schema.sql (cada usuário só enxerga a própria empresa).
 */

export const SUPABASE_URL = 'https://bbdhbjhszgpomdohgxjd.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiZGhiamhzemdwb21kb2hneGpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NTQzOTEsImV4cCI6MjA5OTMzMDM5MX0.fTo045JVfk5_OeZ6bkMEly_xaUFKxlgPrXq7gzdq0gw';

/**
 * O app está configurado para usar o Supabase?
 *
 * Escape hatch de desenvolvimento: rode
 *   localStorage.setItem('cmvpro:force-local', '1')
 * no console e recarregue para forçar o modo local (demo/testes) mesmo com
 * as chaves preenchidas. Remova a chave para voltar ao Supabase.
 */
export function isSupabaseConfigured() {
  try {
    if (localStorage.getItem('cmvpro:force-local') === '1') return false;
  } catch { /* sem storage: segue a configuração */ }
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
