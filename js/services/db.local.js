/**
 * CMV Pro — Backend de dados LOCAL (localStorage)
 * -----------------------------------------------
 * Usado quando o Supabase não está configurado (desenvolvimento, demo,
 * offline total). Implementa exatamente o mesmo contrato de db.supabase.js —
 * as páginas nunca sabem qual backend está ativo.
 */

import { uid } from '../utils/uid.js';

const NS = 'cmvpro:db:v1';

let data = null;

/** Estrutura vazia de um banco recém-criado. */
function emptyDb() {
  return {
    settings: null,
    categorias: [],
    fornecedores: [],
    ingredientes: [],
    produtos: [],
    fichaVersoes: [],
    vendas: [],
    despesas: [],
    movimentos: [],
    compras: [],
  };
}

function load() {
  if (data) return data;
  try {
    const raw = localStorage.getItem(NS);
    data = raw ? { ...emptyDb(), ...JSON.parse(raw) } : emptyDb();
  } catch {
    data = emptyDb();
  }
  return data;
}

function persist() {
  try {
    localStorage.setItem(NS, JSON.stringify(data));
  } catch (err) {
    console.error('[db.local] falha ao persistir:', err);
  }
}

export const db = {
  async all(collection) {
    return [...(load()[collection] ?? [])];
  },

  async get(collection, id) {
    return load()[collection]?.find((d) => d.id === id) ?? null;
  },

  async insert(collection, doc) {
    const now = new Date().toISOString();
    const full = { id: uid(), createdAt: now, updatedAt: now, ...doc };
    load()[collection].push(full);
    persist();
    return full;
  },

  async update(collection, id, patch) {
    const col = load()[collection];
    const idx = col.findIndex((d) => d.id === id);
    if (idx === -1) throw new Error(`[db] ${collection}/${id} não encontrado`);
    col[idx] = { ...col[idx], ...patch, updatedAt: new Date().toISOString() };
    persist();
    return col[idx];
  },

  async remove(collection, id) {
    const col = load()[collection];
    const idx = col.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    col.splice(idx, 1);
    persist();
    return true;
  },

  async setAll(collection, docs) {
    load()[collection] = docs;
    persist();
  },

  async getSettings() {
    return (
      load().settings ?? {
        empresa: 'Meu Negócio',
        segmento: 'restaurante',
        moeda: 'BRL',
        metas: { cmvMax: 35, margemIdeal: 65, margemMinima: 50 },
        canais: {
          balcao: { nome: 'Balcão', comissao: 0 },
          delivery: { nome: 'Delivery próprio', comissao: 0 },
          ifood: { nome: 'iFood', comissao: 25 },
          app99: { nome: '99Food', comissao: 20 },
          keeta: { nome: 'Keeta', comissao: 18 },
        },
      }
    );
  },

  async saveSettings(settings) {
    load().settings = settings;
    persist();
    return settings;
  },

  async isEmpty() {
    const d = load();
    return !d.ingredientes.length && !d.produtos.length;
  },

  async wipe() {
    data = emptyDb();
    persist();
  },
};
