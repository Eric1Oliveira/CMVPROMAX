/**
 * CMV Pro — Relatórios
 * --------------------
 * Seis relatórios com filtro de período + filtro contextual (produto,
 * categoria, fornecedor ou tipo), pré-visualização e exportação em
 * CSV, Excel (.xls) e PDF/impressão.
 */

import { db } from '../services/db.js';
import { custoPorcao, analisarCanal } from '../services/calc.js';
import { valorEstoque } from '../services/estoque.js';
import { money, pct, num, esc, dateShort } from '../utils/format.js';
import { downloadCsv } from '../utils/csv.js';
import { downloadExcel, imprimir } from '../utils/exportar.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { tableSkeleton, pageHead, kpiCard } from '../components/ui.js';
import { bus } from '../core/events.js';

const TIPOS = {
  vendas: 'Vendas',
  produtos: 'CMV por produto',
  movimentos: 'Movimentos de estoque',
  estoque: 'Posição de estoque',
  despesas: 'Despesas',
  compras: 'Compras',
};

const PERIODOS = {
  '7d': { nome: '7 dias', dias: 7 },
  '30d': { nome: '30 dias', dias: 30 },
  mes: { nome: 'Este mês', dias: null },
  tudo: { nome: 'Tudo', dias: Infinity },
};

const state = { tipo: 'vendas', periodo: '30d', filtro: '' };

let offDb = null;

function inicioPeriodo() {
  if (state.periodo === 'tudo') return 0;
  if (state.periodo === 'mes') {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (PERIODOS[state.periodo].dias - 1));
  return d.getTime();
}

/**
 * Monta o relatório selecionado.
 * @returns {{ titulo, filtroOpcoes: {label, opcoes:[{id,nome}]}|null,
 *             colunas: string[], linhas: Array<Array>, resumo: [{label, valor}] }}
 */
function montar(dados) {
  const { vendas, produtos, ingredientes, categorias, fornecedores, movimentos, despesas, compras, settings } = dados;
  const inicio = inicioPeriodo();
  const noPeriodo = (docs) => docs.filter((d) => new Date(d.data ?? d.createdAt).getTime() >= inicio);
  const ingMap = new Map(ingredientes.map((i) => [i.id, i]));
  const prodNome = (id) => produtos.find((p) => p.id === id)?.nome ?? '(excluído)';
  const ingNome = (id) => ingredientes.find((i) => i.id === id)?.nome ?? '(excluído)';
  const catNome = (id) => categorias.find((c) => c.id === id)?.nome ?? 'Sem categoria';
  const fornNome = (id) => fornecedores.find((f) => f.id === id)?.nome ?? 'Sem fornecedor';
  const canalNome = (id) => settings?.canais?.[id]?.nome ?? id;

  switch (state.tipo) {
    case 'vendas': {
      let docs = noPeriodo(vendas);
      if (state.filtro) docs = docs.filter((v) => v.produtoId === state.filtro);
      docs.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
      const receita = docs.reduce((s, v) => s + v.qtd * v.precoUnit, 0);
      return {
        titulo: 'Relatório de vendas',
        filtroOpcoes: { label: 'Produto', opcoes: produtos.map((p) => ({ id: p.id, nome: p.nome })) },
        colunas: ['Data', 'Produto', 'Canal', 'Qtd', 'Preço unit.', 'Total'],
        linhas: docs.map((v) => [
          dateShort(v.data), prodNome(v.produtoId), canalNome(v.canal),
          v.qtd, money(v.precoUnit), money(v.qtd * v.precoUnit),
        ]),
        resumo: [
          { label: 'Vendas', valor: String(docs.length) },
          { label: 'Receita', valor: money(receita) },
          { label: 'Ticket médio', valor: money(docs.length ? receita / docs.length : 0) },
        ],
      };
    }

    case 'produtos': {
      let docs = produtos.filter((p) => p.ficha?.itens?.length && p.precos?.balcao);
      if (state.filtro) docs = docs.filter((p) => p.categoriaId === state.filtro);
      const linhas = docs.map((p) => {
        const custo = custoPorcao(p, ingMap);
        const a = analisarCanal(custo, p.precos.balcao, { embalagem: p.taxaEmbalagem ?? 0 });
        return { p, custo, a };
      }).sort((x, y) => y.a.cmvPct - x.a.cmvPct);
      const mediaCmv = linhas.length ? linhas.reduce((s, l) => s + l.a.cmvPct, 0) / linhas.length : 0;
      return {
        titulo: 'CMV por produto (balcão)',
        filtroOpcoes: {
          label: 'Categoria',
          opcoes: categorias.filter((c) => c.tipo === 'produto').map((c) => ({ id: c.id, nome: c.nome })),
        },
        colunas: ['Produto', 'Categoria', 'Preço', 'Custo', 'CMV %', 'Margem %', 'Lucro'],
        linhas: linhas.map(({ p, custo, a }) => [
          p.nome, catNome(p.categoriaId), money(p.precos.balcao), money(custo),
          pct(a.cmvPct), pct(a.margemPct), money(a.lucro),
        ]),
        resumo: [
          { label: 'Produtos', valor: String(linhas.length) },
          { label: 'CMV médio', valor: pct(mediaCmv) },
        ],
      };
    }

    case 'movimentos': {
      let docs = noPeriodo(movimentos);
      if (state.filtro) docs = docs.filter((m) => m.ingredienteId === state.filtro);
      docs.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
      const nomes = { entrada: 'Entrada', saida: 'Saída', perda: 'Perda', ajuste: 'Inventário' };
      return {
        titulo: 'Movimentos de estoque',
        filtroOpcoes: { label: 'Insumo', opcoes: ingredientes.map((i) => ({ id: i.id, nome: i.nome })) },
        colunas: ['Data', 'Insumo', 'Tipo', 'Qtd', 'Custo', 'Lote', 'Observações'],
        linhas: docs.map((m) => [
          dateShort(m.data), ingNome(m.ingredienteId), nomes[m.tipo] ?? m.tipo,
          `${num(m.qtd)} ${ingMap.get(m.ingredienteId)?.unidade ?? ''}`,
          m.custo != null ? money(m.custo) : '', m.lote ?? '', m.observacoes ?? '',
        ]),
        resumo: [
          { label: 'Movimentos', valor: String(docs.length) },
          { label: 'Perdas', valor: String(docs.filter((m) => m.tipo === 'perda').length) },
        ],
      };
    }

    case 'estoque': {
      let docs = ingredientes.filter((i) => i.estoque != null);
      if (state.filtro) docs = docs.filter((i) => i.categoriaId === state.filtro);
      docs.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      const total = docs.reduce((s, i) => s + valorEstoque(i), 0);
      return {
        titulo: 'Posição de estoque (agora)',
        filtroOpcoes: {
          label: 'Categoria',
          opcoes: categorias.filter((c) => c.tipo === 'ingrediente').map((c) => ({ id: c.id, nome: c.nome })),
        },
        colunas: ['Insumo', 'Categoria', 'Saldo', 'Mínimo', 'Valor'],
        linhas: docs.map((i) => [
          i.nome, catNome(i.categoriaId), `${num(i.estoque)} ${i.unidade}`,
          i.estoqueMin != null ? `${num(i.estoqueMin)} ${i.unidade}` : '',
          money(valorEstoque(i)),
        ]),
        resumo: [
          { label: 'Itens', valor: String(docs.length) },
          { label: 'Valor total', valor: money(total) },
          { label: 'Abaixo do mínimo', valor: String(docs.filter((i) => i.estoqueMin != null && i.estoque <= i.estoqueMin).length) },
        ],
      };
    }

    case 'despesas': {
      let docs = noPeriodo(despesas);
      if (state.filtro) docs = docs.filter((d) => d.tipo === state.filtro);
      docs.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
      const total = docs.reduce((s, d) => s + (d.valor ?? 0), 0);
      return {
        titulo: 'Relatório de despesas',
        filtroOpcoes: {
          label: 'Tipo',
          opcoes: [{ id: 'fixa', nome: 'Fixas' }, { id: 'variavel', nome: 'Variáveis' }],
        },
        colunas: ['Data', 'Descrição', 'Tipo', 'Valor'],
        linhas: docs.map((d) => [
          dateShort(d.data), d.nome, d.tipo === 'fixa' ? 'Fixa' : 'Variável', money(d.valor),
        ]),
        resumo: [
          { label: 'Lançamentos', valor: String(docs.length) },
          { label: 'Total', valor: money(total) },
        ],
      };
    }

    case 'compras': {
      let docs = noPeriodo(compras);
      if (state.filtro) docs = docs.filter((c) => c.fornecedorId === state.filtro);
      docs.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
      const nomes = { rascunho: 'Rascunho', enviado: 'Enviado', recebido: 'Recebido', cancelado: 'Cancelado' };
      return {
        titulo: 'Relatório de compras',
        filtroOpcoes: { label: 'Fornecedor', opcoes: fornecedores.map((f) => ({ id: f.id, nome: f.nome })) },
        colunas: ['Data', 'Fornecedor', 'Status', 'Itens', 'Total'],
        linhas: docs.map((c) => [
          dateShort(c.data), fornNome(c.fornecedorId), nomes[c.status] ?? c.status,
          c.itens?.length ?? 0, money(c.total ?? 0),
        ]),
        resumo: [
          { label: 'Pedidos', valor: String(docs.length) },
          { label: 'Total recebido', valor: money(docs.filter((c) => c.status === 'recebido').reduce((s, c) => s + (c.total ?? 0), 0)) },
        ],
      };
    }
  }
}

/* -------------------------------- página -------------------------------- */

export default {
  async render(container, ctx) {
    container.innerHTML = pageHead({
      title: 'Relatórios',
      subtitle: 'Exporte em CSV, Excel ou PDF — com filtros por período, produto, categoria e fornecedor.',
      actions: `
        <button class="btn btn--ghost" data-exp="csv">${icon('download', 16)} CSV</button>
        <button class="btn btn--ghost" data-exp="excel">${icon('download', 16)} Excel</button>
        <button class="btn btn--secondary" data-exp="pdf">${icon('chart', 16)} PDF / Imprimir</button>`,
    }) + `<div data-body>${tableSkeleton()}</div>`;

    const bodyEl = container.querySelector('[data-body]');
    let atual = null; // relatório montado (para exportação)

    container.querySelectorAll('[data-exp]').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (!atual?.linhas?.length) {
          toast.info('Relatório vazio', 'Nada para exportar com os filtros atuais.');
          return;
        }
        const slug = state.tipo + (state.periodo !== 'tudo' ? `-${state.periodo}` : '');
        if (btn.dataset.exp === 'csv') {
          downloadCsv(`${slug}.csv`, atual.colunas, atual.linhas);
          toast.success('CSV exportado', `${atual.linhas.length} linha(s).`);
        } else if (btn.dataset.exp === 'excel') {
          downloadExcel(`${slug}.xls`, atual.titulo, atual.colunas, atual.linhas);
          toast.success('Excel exportado', `${atual.linhas.length} linha(s).`);
        } else {
          imprimir(); // no diálogo: escolher impressora ou "Salvar como PDF"
        }
      }));

    const paint = async () => {
      const [vendas, produtos, ingredientes, categorias, fornecedores, movimentos, despesas, compras, settings] =
        await Promise.all([
          db.all('vendas'), db.all('produtos'), db.all('ingredientes'), db.all('categorias'),
          db.all('fornecedores'), db.all('movimentos'), db.all('despesas'), db.all('compras'),
          db.getSettings(),
        ]);

      atual = montar({ vendas, produtos, ingredientes, categorias, fornecedores, movimentos, despesas, compras, settings });
      const preview = atual.linhas.slice(0, 100);

      bodyEl.innerHTML = `
        <div class="toolbar anim-in">
          <div class="toolbar__filters">
            ${Object.entries(TIPOS).map(([id, nome]) => `
              <button class="chip ${state.tipo === id ? 'is-active' : ''}" data-tipo="${id}">${nome}</button>`).join('')}
          </div>
        </div>
        <div class="toolbar anim-in">
          <div class="toolbar__filters">
            ${Object.entries(PERIODOS).map(([id, p]) => `
              <button class="chip ${state.periodo === id ? 'is-active' : ''}" data-periodo="${id}">${p.nome}</button>`).join('')}
            ${atual.filtroOpcoes ? `
              <select class="input" data-filtro style="width:auto;height:32px;font-size:var(--text-sm)">
                <option value="">${esc(atual.filtroOpcoes.label)}: todos</option>
                ${atual.filtroOpcoes.opcoes.map((o) =>
                  `<option value="${o.id}" ${state.filtro === o.id ? 'selected' : ''}>${esc(o.nome)}</option>`).join('')}
              </select>` : ''}
          </div>
        </div>

        <section class="grid grid--kpi" style="margin-bottom:var(--sp-4)">
          ${atual.resumo.map((r) => kpiCard({ label: r.label, value: r.valor })).join('')}
        </section>

        <div class="card anim-in print-area">
          <div class="card__head">
            <h2>${esc(atual.titulo)}</h2>
            <span class="badge badge--neutral">${atual.linhas.length} linha(s)</span>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr>${atual.colunas.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
              <tbody>
                ${preview.length ? preview.map((r) => `
                  <tr>${r.map((v, i) => `<td class="${i >= atual.colunas.length - 2 ? 'cell-num' : ''}">${esc(String(v ?? ''))}</td>`).join('')}</tr>`).join('')
                : `<tr><td colspan="${atual.colunas.length}" class="text-2" style="text-align:center;padding:var(--sp-8)">Nenhum dado com os filtros atuais.</td></tr>`}
              </tbody>
            </table>
          </div>
          ${atual.linhas.length > preview.length ? `
            <p class="text-3" style="padding:var(--sp-3) var(--sp-5);font-size:var(--text-sm)">
              Pré-visualização das primeiras ${preview.length} linhas — a exportação inclui todas as ${atual.linhas.length}.
            </p>` : ''}
        </div>
      `;

      bodyEl.querySelectorAll('[data-tipo]').forEach((c) =>
        c.addEventListener('click', () => { state.tipo = c.dataset.tipo; state.filtro = ''; paint(); }));
      bodyEl.querySelectorAll('[data-periodo]').forEach((c) =>
        c.addEventListener('click', () => { state.periodo = c.dataset.periodo; paint(); }));
      bodyEl.querySelector('[data-filtro]')?.addEventListener('change', (e) => {
        state.filtro = e.target.value; paint();
      });
    };

    await paint();
    offDb = bus.on('db:changed', () => paint());
  },

  destroy() {
    offDb?.(); offDb = null;
  },
};
