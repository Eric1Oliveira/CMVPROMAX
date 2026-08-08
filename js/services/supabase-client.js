/**
 * CMV Pro — Cliente Supabase (singleton)
 * --------------------------------------
 * Carrega o SDK oficial via CDN (ESM) apenas quando o Supabase está
 * configurado — o modo local nunca baixa a biblioteca.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from '../config.js';

let clientPromise = null;

/** Retorna (criando uma única vez) o cliente Supabase. */
export function getSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase não configurado — preencha js/config.js.');
  }
  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2')
      .then(({ createClient }) =>
        createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            // Detecta tokens na URL (confirmação de e-mail / recuperação de
            // senha) e limpa o hash antes do router assumir.
            detectSessionInUrl: true,
          },
        })
      );
  }
  return clientPromise;
}
