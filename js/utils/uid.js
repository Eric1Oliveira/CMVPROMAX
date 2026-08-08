/**
 * CMV Pro — Gerador de ids
 * ------------------------
 * Id único ordenável no tempo (prefixo timestamp em base36). Usado no modo
 * local e em importações; no Supabase as colunas id (text) também aceitam
 * estes valores, então dados locais podem ser migrados sem conflito.
 */

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
