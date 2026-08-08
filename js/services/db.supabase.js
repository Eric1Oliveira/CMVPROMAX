/**
 * CMV Pro — Backend de dados SUPABASE (PostgREST)
 * -----------------------------------------------
 * Mesmo contrato do db.local.js, falando com as tabelas criadas por
 * supabase/schema.sql. Particularidades:
 *
 *  - "empresaId" é injetado em toda escrita (o RLS também valida no servidor);
 *  - as colunas do banco são camelCase (entre aspas no SQL) — o documento JS
 *    viaja 1:1, sem camada de mapeamento;
 *  - listagens são paginadas em lotes de 1000 (limite padrão do PostgREST);
 *  - as "configurações" do app são a linha da empresa (tabela empresas).
 */

import { getSupabase } from './supabase-client.js';
import { getEmpresaId } from '../core/auth.js';

/** Nome da tabela para cada coleção do app. */
const TABLES = {
  categorias: 'categorias',
  fornecedores: 'fornecedores',
  ingredientes: 'ingredientes',
  produtos: 'produtos',
  fichaVersoes: 'ficha_versoes',
  vendas: 'vendas',
  despesas: 'despesas',
  movimentos: 'movimentos',
  compras: 'compras',
};

const PAGE = 1000;

function table(collection) {
  const t = TABLES[collection];
  if (!t) throw new Error(`[db.supabase] coleção desconhecida: ${collection}`);
  return t;
}

/** Converte erro do PostgREST em Error com mensagem amigável. */
function check(error, contexto) {
  if (error) {
    console.error(`[db.supabase] ${contexto}:`, error);
    throw new Error(error.message || `Falha ao ${contexto}.`);
  }
}

/** Remove chaves undefined (PostgREST rejeita colunas inexistentes). */
function clean(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export const db = {
  async all(collection) {
    const sb = await getSupabase();
    const rows = [];
    // pagina até esgotar (o PostgREST devolve no máximo 1000 por chamada)
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from(table(collection))
        .select('*')
        .order('createdAt', { ascending: true })
        .range(from, from + PAGE - 1);
      check(error, `listar ${collection}`);
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows;
  },

  async get(collection, id) {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from(table(collection))
      .select('*')
      .eq('id', id)
      .maybeSingle();
    check(error, `buscar ${collection}/${id}`);
    return data;
  },

  async insert(collection, doc) {
    const sb = await getSupabase();
    // empresaId nulo fica de fora: o DEFAULT da coluna (current_empresa_id())
    // resolve no servidor a partir do usuário autenticado.
    const { data, error } = await sb
      .from(table(collection))
      .insert(clean({ ...doc, empresaId: getEmpresaId() ?? undefined }))
      .select()
      .single();
    check(error, `criar em ${collection}`);
    return data;
  },

  async update(collection, id, patch) {
    const sb = await getSupabase();
    // id/empresaId nunca são alterados por patch
    const { id: _i, empresaId: _e, createdAt: _c, ...safe } = patch;
    const { data, error } = await sb
      .from(table(collection))
      .update(clean(safe))
      .eq('id', id)
      .select()
      .single();
    check(error, `atualizar ${collection}/${id}`);
    return data;
  },

  async remove(collection, id) {
    const sb = await getSupabase();
    const { error } = await sb.from(table(collection)).delete().eq('id', id);
    check(error, `excluir ${collection}/${id}`);
    return true;
  },

  /** Substitui a coleção inteira (seed/importação): apaga e insere em lotes. */
  async setAll(collection, docs) {
    const sb = await getSupabase();
    const empresaId = getEmpresaId();

    const del = await sb.from(table(collection)).delete().eq('empresaId', empresaId);
    check(del.error, `limpar ${collection}`);

    const payload = docs.map((d) => clean({ ...d, empresaId: empresaId ?? undefined }));
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await sb.from(table(collection)).insert(payload.slice(i, i + 500));
      check(error, `inserir lote em ${collection}`);
    }
  },

  /* -------- configurações = linha da empresa (tabela empresas) -------- */

  async getSettings() {
    // Defaults seguros: mantêm o app de pé mesmo se a empresa ainda não
    // existir (conta antiga sem perfil — ver supabase/fix-perfis.sql).
    const fallback = {
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
    };

    const empresaId = getEmpresaId();
    if (!empresaId) {
      console.warn('[db.supabase] sessão sem empresa — usando configurações padrão.');
      return fallback;
    }

    const sb = await getSupabase();
    const { data, error } = await sb
      .from('empresas')
      .select('*')
      .eq('id', empresaId)
      .maybeSingle();
    if (error) {
      console.error('[db.supabase] carregar configurações:', error);
      return fallback;
    }
    if (!data) return fallback;
    return {
      empresa: data.nome,
      segmento: data.segmento,
      moeda: data.moeda,
      metas: data.metas ?? fallback.metas,
      canais: data.canais ?? fallback.canais,
    };
  },

  async saveSettings(settings) {
    if (!getEmpresaId()) {
      throw new Error('Sua conta não tem empresa vinculada — rode supabase/fix-perfis.sql no SQL Editor e recarregue.');
    }
    const sb = await getSupabase();
    const { error } = await sb
      .from('empresas')
      .update({
        nome: settings.empresa,
        segmento: settings.segmento,
        moeda: settings.moeda,
        metas: settings.metas,
        canais: settings.canais,
      })
      .eq('id', getEmpresaId());
    check(error, 'salvar configurações');
    return settings;
  },

  async isEmpty() {
    const sb = await getSupabase();
    const [ing, prod] = await Promise.all([
      sb.from('ingredientes').select('id', { count: 'exact', head: true }),
      sb.from('produtos').select('id', { count: 'exact', head: true }),
    ]);
    check(ing.error, 'contar ingredientes');
    check(prod.error, 'contar produtos');
    return (ing.count ?? 0) === 0 && (prod.count ?? 0) === 0;
  },

  async wipe() {
    const sb = await getSupabase();
    const empresaId = getEmpresaId();
    for (const t of Object.values(TABLES)) {
      const { error } = await sb.from(t).delete().eq('empresaId', empresaId);
      check(error, `limpar ${t}`);
    }
  },
};
