/**
 * CMV Pro — Camada de dados (fachada + cache)
 * -------------------------------------------
 * Escolhe o backend em tempo de carga:
 *   - Supabase (js/config.js preenchido) → db.supabase.js
 *   - Local (localStorage)               → db.local.js
 *
 * CACHE "read-through": a primeira leitura de cada coleção busca no backend
 * e guarda em memória; as leituras seguintes retornam NA HORA, sem rede —
 * então trocar de tela é instantâneo. As mutações (insert/update/remove)
 * atualizam o cache local e SÓ ENTÃO emitem 'db:changed', garantindo que
 * quem reage ao evento leia sempre o dado já atualizado.
 *
 * Coleções: categorias, fornecedores, ingredientes, produtos, fichaVersoes,
 *           vendas, despesas, movimentos, compras (+ settings da empresa).
 */

import { isSupabaseConfigured } from '../config.js';
import { bus } from '../core/events.js';

export { uid } from '../utils/uid.js';

// Import dinâmico: o modo local nunca baixa o SDK do Supabase (e vice-versa).
const impl = isSupabaseConfigured()
  ? (await import('./db.supabase.js')).db
  : (await import('./db.local.js')).db;

/* ------------------------------ cache ------------------------------------ */

const cache = new Map();     // collection -> array (fonte rápida em memória)
const inflight = new Map();  // collection -> Promise (evita buscas duplicadas)
let settingsCache = null;

/** Carrega a coleção (do cache se quente; senão busca uma vez e guarda). */
function load(collection) {
  if (cache.has(collection)) return Promise.resolve(cache.get(collection));
  if (inflight.has(collection)) return inflight.get(collection);
  const p = impl.all(collection)
    .then((data) => { cache.set(collection, data); inflight.delete(collection); return data; })
    .catch((err) => { inflight.delete(collection); throw err; });
  inflight.set(collection, p);
  return p;
}

/** Notifica interessados APÓS o cache estar atualizado. */
function changed(collection) {
  bus.emit('db:changed', { collection });
}

/** Pré-carrega coleções em segundo plano (aquece o cache). */
export function warm(collections = []) {
  return Promise.all(collections.map((c) => load(c).catch(() => {})));
}

/** Invalida o cache (força rebusca na próxima leitura). */
export function invalidate(collection) {
  if (collection) { cache.delete(collection); }
  else { cache.clear(); settingsCache = null; }
}

export const db = {
  /** Todos os documentos (cópia rasa — mutar o array não afeta o cache). */
  async all(collection) {
    return [...(await load(collection))];
  },

  async get(collection, id) {
    return (await load(collection)).find((d) => d.id === id) ?? null;
  },

  async insert(collection, doc) {
    const created = await impl.insert(collection, doc);
    if (cache.has(collection)) cache.get(collection).push(created);
    changed(collection);
    return created;
  },

  async update(collection, id, patch) {
    const updated = await impl.update(collection, id, patch);
    if (cache.has(collection)) {
      const arr = cache.get(collection);
      const i = arr.findIndex((d) => d.id === id);
      if (i >= 0) arr[i] = updated;
    }
    changed(collection);
    return updated;
  },

  async remove(collection, id) {
    const ok = await impl.remove(collection, id);
    if (ok && cache.has(collection)) {
      const arr = cache.get(collection);
      const i = arr.findIndex((d) => d.id === id);
      if (i >= 0) arr.splice(i, 1);
    }
    changed(collection);
    return ok;
  },

  async setAll(collection, docs) {
    await impl.setAll(collection, docs);
    cache.set(collection, [...docs]);
    changed(collection);
  },

  /* ---------------- configurações (documento único) ---------------- */

  async getSettings() {
    if (settingsCache) return settingsCache;
    settingsCache = await impl.getSettings();
    return settingsCache;
  },

  async saveSettings(settings) {
    const saved = await impl.saveSettings(settings);
    settingsCache = saved ?? settings;
    changed('settings');
    return settingsCache;
  },

  async isEmpty() {
    // usa o cache quando quente (evita 2 chamadas de rede)
    if (cache.has('ingredientes') && cache.has('produtos')) {
      return cache.get('ingredientes').length === 0 && cache.get('produtos').length === 0;
    }
    return impl.isEmpty();
  },

  async wipe() {
    await impl.wipe();
    invalidate();
    bus.emit('db:changed', { collection: '*' });
  },
};
