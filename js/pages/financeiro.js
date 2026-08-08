/**
 * CMV Pro — Financeiro
 * --------------------
 * Caixa do negócio: lançamento de vendas (com baixa automática de estoque
 * pela ficha técnica) e despesas, fluxo de caixa diário, metas e lucro
 * líquido real (receita − insumos − comissões − despesas).
 */

import { db } from '../services/db.js';
import { resumirVendas, custoPorcao } from '../services/calc.js';
import { baixaPorVenda } from '../services/estoque.js';
import { money, pct, num, esc, parseMoney, dateRelative } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { emptyState, dashSkeleton, pageHead, kpiCard, btnLoading } from '../components/ui.js';
import { barChart, legend } from '../components/charts.js';
import { bus } from '../core/events.js';
import { navigate } from '../core/router.js';

const PERIODOS = {
  hoje: { nome: 'Hoje', dias: 1 },
  '7d': { nome: '7 dias', dias: 7 },
  '30d': { nome: '30 dias', dias: 30 },
  mes: { nome: 'Este mês', dias: null }, // desde o dia 1º
};

const state = { periodo: '30d' };

let offDb = null;

/** Início do período selecionado (timestamp). */
function inicioPeriodo() {
  if (state.periodo === 'mes') {
    const d = new Date();
    d.setDate(1); d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const dias = PERIODOS[state.periodo].dias;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (dias - 1));
  return d.getTime();
}

/* --------------------------- lançar venda ------------------------------- */

async function abrirVenda({ produtos, settings }) {
  const canais = settings?.canais ?? {};
  const vendaveis = produtos.filter((p) => Object.values(p.precos ?? {}).some((v) => v > 0));
  if (!vendaveis.length) {
    toast.info('Nenhum produto com preço', 'Defina os preços de venda no cadastro dos produtos.');
    return;
  }

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-grid">
      <div class="field span-2">
        <label class="field__label">Produto</label>
        <select class="input" name="produtoId">
          ${vendaveis.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field__label">Canal</label>
        <select class="input" name="canal">
          ${Object.entries(canais).map(([id, c]) => `<option value="${id}">${esc(c.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field__label">Quantidade</label>
        <input class="input" name="qtd" data-mask="int" value="1" />
      </div>
      <div class="field">
        <label class="field__label">Preço unitário</label>
        <div class="input-group">
          <span class="input-group__affix">R$</span>
          <input class="input" name="precoUnit" data-mask="money" />
        </div>
        <span class="field__hint" data-hint-preco></span>
      </div>
      <div class="field">
        <label class="field__label">Data</label>
        <input class="input" name="data" type="datetime-local" />
      </div>
      <div class="field span-2" style="flex-direction:row;align-items:center;gap:var(--sp-3)">
        <label class="switch">
          <input type="checkbox" name="baixa" checked />
          <span class="switch__track"></span>
        </label>
        <span>Dar baixa automática no estoque (pela ficha técnica)</span>
      </div>
    </div>`;

  const get = (n) => content.querySelector(`[name="${n}"]`);

  // data padrão: agora (no fuso local, formato do input datetime-local)
  const agora = new Date();
  agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
  get('data').value = agora.toISOString().slice(0, 16);

  // preço acompanha produto + canal (mas continua editável)
  const atualizaPreco = () => {
    const p = vendaveis.find((x) => x.id === get('produtoId').value);
    const canal = get('canal').value;
    const preco = p?.precos?.[canal] ?? p?.precos?.balcao ?? 0;
    get('precoUnit').value = preco.toFixed(2).replace('.', ',');
    content.querySelector('[data-hint-preco]').textContent =
      p?.precos?.[canal] == null ? 'Canal sem preço definido — usando o de balcão.' : '';
  };
  get('produtoId').addEventListener('change', atualizaPreco);
  get('canal').addEventListener('change', atualizaPreco);
  atualizaPreco();

  const footer = document.createElement('div');
  footer.style.display = 'contents';
  footer.innerHTML = `
    <button class="btn btn--secondary" data-cancel>Cancelar</button>
    <button class="btn btn--primary" data-save>${icon('check', 16)} Lançar venda</button>`;

  const m = openModal({ title: 'Lançar venda', content, footer, size: 'lg' });
  footer.querySelector('[data-cancel]').addEventListener('click', () => m.close());
  footer.querySelector('[data-save]').addEventListener('click', async (e) => {
    const p = vendaveis.find((x) => x.id === get('produtoId').value);
    const qtd = Math.max(1, Math.round(parseMoney(get('qtd').value)));
    const precoUnit = parseMoney(get('precoUnit').value);
    if (!(precoUnit > 0)) {
      toast.warning('Preço inválido', 'Informe o preço unitário da venda.');
      return;
    }
    const restore = btnLoading(e.currentTarget, 'Lançando…');
    try {
      await db.insert('vendas', {
        produtoId: p.id,
        canal: get('canal').value,
        qtd,
        precoUnit,
        data: new Date(get('data').value || Date.now()).toISOString(),
      });
      let baixaMsg = '';
      if (get('baixa').checked && p.ficha?.itens?.length) {
        const consumos = await baixaPorVenda(p, qtd);
        baixaMsg = ` · baixa em ${consumos.length} insumo(s)`;
      }
      m.close();
      toast.success('Venda lançada', `${qtd}× ${p.nome} — ${money(qtd * precoUnit)}${baixaMsg}`);
    } catch (err) {
      restore();
      toast.error('Não foi possível lançar', err.message);
    }
  });
}

/* --------------------------- lançar despesa ----------------------------- */

function abrirDespesa() {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-grid">
      <div class="field span-2">
        <label class="field__label">Descrição <span class="req">*</span></label>
        <input class="input" name="nome" placeholder="Ex.: Aluguel, Energia, Gás…" />
        <span class="field__error" role="alert"></span>
      </div>
      <div class="field">
        <label class="field__label">Valor <span class="req">*</span></label>
        <div class="input-group">
          <span class="input-group__affix">R$</span>
          <input class="input" name="valor" data-mask="money" placeholder="0,00" />
        </div>
        <span class="field__error" role="alert"></span>
      </div>
      <div class="field">
        <label class="field__label">Tipo</label>
        <select class="input" name="tipo">
          <option value="fixa">Fixa (aluguel, folha…)</option>
          <option value="variavel">Variável (energia, gás…)</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label">Data</label>
        <input class="input" name="data" type="date" value="${new Date().toISOString().slice(0, 10)}" />
      </div>
    </div>`;

  const footer = document.createElement('div');
  footer.style.display = 'contents';
  footer.innerHTML = `
    <button class="btn btn--secondary" data-cancel>Cancelar</button>
    <button class="btn btn--primary" data-save>Lançar despesa</button>`;

  const m = openModal({ title: 'Lançar despesa', content, footer });
  const get = (n) => content.querySelector(`[name="${n}"]`);
  const err = (n, msg) => {
    const f = get(n).closest('.field');
    f.classList.toggle('has-error', Boolean(msg));
    if (msg) f.querySelector('.field__error').textContent = msg;
  };

  footer.querySelector('[data-cancel]').addEventListener('click', () => m.close());
  footer.querySelector('[data-save]').addEventListener('click', async (e) => {
    const nome = get('nome').value.trim();
    const valor = parseMoney(get('valor').value);
    err('nome', nome ? '' : 'Informe a descrição.');
    err('valor', valor > 0 ? '' : 'Informe o valor.');
    if (!nome || !(valor > 0)) return;

    const restore = btnLoading(e.currentTarget);
    try {
      await db.insert('despesas', {
        nome, valor,
        tipo: get('tipo').value,
        data: new Date(get('data').value || Date.now()).toISOString(),
      });
      m.close();
      toast.success('Despesa lançada', `${nome} — ${money(valor)}`);
    } catch (errr) {
      restore();
      toast.error('Não foi possível lançar', errr.message);
    }
  });
}

/* -------------------------------- página -------------------------------- */

export default {
  async render(container, ctx) {
    container.innerHTML = pageHead({
      title: 'Financeiro',
      subtitle: 'Vendas, despesas e o lucro que sobra de verdade.',
      actions: `
        <button class="btn btn--secondary" data-despesa>${icon('wallet', 16)} Lançar despesa</button>
        <button class="btn btn--primary" data-venda>${icon('plus', 16)} Lançar venda</button>`,
    }) + `<div data-body>${dashSkeleton()}</div>`;

    const bodyEl = container.querySelector('[data-body]');
    let cache = { produtos: [], settings: null };

    ctx.setFab?.({ label: 'Lançar venda', onClick: () => abrirVenda(cache) });
    container.querySelector('[data-venda]').addEventListener('click', () => abrirVenda(cache));
    container.querySelector('[data-despesa]').addEventListener('click', abrirDespesa);

    const paint = async () => {
      const [vendas, despesas, produtos, ingredientes, settings] = await Promise.all([
        db.all('vendas'), db.all('despesas'), db.all('produtos'),
        db.all('ingredientes'), db.getSettings(),
      ]);
      cache = { produtos, settings };

      const inicio = inicioPeriodo();
      const noPeriodo = (docs) => docs.filter((d) => new Date(d.data).getTime() >= inicio);
      const vendasP = noPeriodo(vendas);
      const despesasP = noPeriodo(despesas);

      const resumo = resumirVendas(vendasP, produtos, ingredientes, settings);
      const totalDespesas = despesasP.reduce((s, d) => s + (d.valor ?? 0), 0);
      const lucroLiquido = resumo.lucro - totalDespesas;
      const metas = settings?.metas ?? {};

      /* fluxo de caixa diário: entradas (vendas) × saídas (despesas) */
      const dias = state.periodo === 'mes'
        ? new Date().getDate()
        : PERIODOS[state.periodo].dias;
      const buckets = [];
      for (let d = dias - 1; d >= 0; d--) {
        const dia = new Date();
        dia.setHours(0, 0, 0, 0);
        dia.setDate(dia.getDate() - d);
        buckets.push({
          key: dia.toISOString().slice(0, 10),
          label: dia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          entradas: 0, saidas: 0,
        });
      }
      const idx = new Map(buckets.map((b, i) => [b.key, i]));
      for (const v of vendasP) {
        const i = idx.get(v.data.slice(0, 10));
        if (i != null) buckets[i].entradas += v.qtd * v.precoUnit;
      }
      for (const d of despesasP) {
        const i = idx.get(d.data.slice(0, 10));
        if (i != null) buckets[i].saidas += d.valor ?? 0;
      }
      // no mobile/período longo, mostra no máximo 14 colunas
      const plotBuckets = buckets.length > 14
        ? buckets.slice(buckets.length - 14) : buckets;

      const vendasRecentes = [...vendasP]
        .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '')).slice(0, 6);
      const despesasRecentes = [...despesasP]
        .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '')).slice(0, 6);
      const prodNome = (id) => produtos.find((p) => p.id === id)?.nome ?? '(excluído)';
      const canalNome = (id) => settings?.canais?.[id]?.nome ?? id;

      bodyEl.innerHTML = `
        <div class="toolbar anim-in">
          <div class="toolbar__filters" role="tablist" aria-label="Período">
            ${Object.entries(PERIODOS).map(([id, p]) => `
              <button class="chip ${state.periodo === id ? 'is-active' : ''}" data-periodo="${id}"
                role="tab" aria-selected="${state.periodo === id}">${p.nome}</button>`).join('')}
          </div>
        </div>

        <section class="grid grid--kpi" style="margin-bottom:var(--sp-4)">
          ${kpiCard({ label: 'Receita', value: money(resumo.receita), hint: `${vendasP.length} venda(s)` })}
          ${kpiCard({ label: 'Insumos + comissões', value: money(resumo.custo + resumo.comissoes), hint: `CMV ${pct(resumo.cmvPct)}` })}
          ${kpiCard({ label: 'Despesas', value: money(totalDespesas), hint: `${despesasP.length} lançamento(s)` })}
          ${kpiCard({
            label: 'Lucro líquido',
            value: `<span class="${lucroLiquido < 0 ? 'text-danger' : 'text-success'}">${money(lucroLiquido)}</span>`,
            hint: resumo.receita > 0 ? `${pct((lucroLiquido / resumo.receita) * 100)} da receita` : '',
          })}
        </section>

        <section class="grid grid--2" style="margin-bottom:var(--sp-4);align-items:start">
          <div class="card anim-in">
            <div class="chart-card__head">
              <h2>Fluxo de caixa</h2>
              <span class="badge badge--neutral">${plotBuckets.length} dias</span>
            </div>
            <div class="chart-card__legend" data-legend></div>
            <div class="chart-card__plot" data-chart></div>
          </div>

          <div class="card anim-in">
            <div class="card__head"><h2>Metas do período</h2></div>
            <div class="card__body" style="display:flex;flex-direction:column;gap:var(--sp-5)">
              ${(() => {
                const metaCmv = metas.cmvMax ?? 35;
                const cmvOk = resumo.cmvPct <= metaCmv;
                const fillCmv = Math.min(100, (resumo.cmvPct / metaCmv) * 100);
                const metaMargem = metas.margemIdeal ?? 65;
                const margemFill = Math.min(100, (resumo.margemPct / metaMargem) * 100);
                return `
                  <div>
                    <div class="stat-row"><span class="text-2">CMV — meta ≤ ${metaCmv}%</span>
                      <strong class="${cmvOk ? 'text-success' : 'text-danger'}">${pct(resumo.cmvPct)}</strong></div>
                    <div class="meter"><div class="meter__fill ${cmvOk ? '' : 'meter__fill--danger'}" style="width:${fillCmv}%"></div></div>
                  </div>
                  <div>
                    <div class="stat-row"><span class="text-2">Margem bruta — meta ${metaMargem}%</span>
                      <strong>${pct(resumo.margemPct)}</strong></div>
                    <div class="meter"><div class="meter__fill ${resumo.margemPct >= metaMargem ? '' : 'meter__fill--warning'}" style="width:${margemFill}%"></div></div>
                  </div>
                  <p class="text-3" style="font-size:var(--text-sm)">
                    Lucro líquido = receita − insumos (${money(resumo.custo)}) − comissões
                    (${money(resumo.comissoes)}) − despesas (${money(totalDespesas)}).
                  </p>`;
              })()}
            </div>
          </div>
        </section>

        <section class="grid grid--2" style="align-items:start">
          <div class="card anim-in">
            <div class="card__head"><h2>Vendas recentes</h2></div>
            <div class="card__body card__body--flush">
              ${vendasRecentes.length ? vendasRecentes.map((v) => `
                <div class="alert-item" data-venda-id="${v.id}">
                  <div class="alert-item__icon alert-item__icon--info">${icon('trending-up', 15)}</div>
                  <div style="flex:1;min-width:0">
                    <div class="alert-item__title">${v.qtd}× ${esc(prodNome(v.produtoId))} · ${money(v.qtd * v.precoUnit)}</div>
                    <div class="alert-item__desc">${esc(canalNome(v.canal))} · ${dateRelative(v.data)}</div>
                  </div>
                  <button class="icon-btn" data-del-venda aria-label="Excluir venda">${icon('trash', 15)}</button>
                </div>`).join('')
              : `<div class="empty-state" style="padding:var(--sp-8)"><p class="text-2">Nenhuma venda no período.</p></div>`}
            </div>
          </div>

          <div class="card anim-in">
            <div class="card__head"><h2>Despesas recentes</h2></div>
            <div class="card__body card__body--flush">
              ${despesasRecentes.length ? despesasRecentes.map((d) => `
                <div class="alert-item" data-despesa-id="${d.id}">
                  <div class="alert-item__icon alert-item__icon--warning">${icon('wallet', 15)}</div>
                  <div style="flex:1;min-width:0">
                    <div class="alert-item__title">${esc(d.nome)} · ${money(d.valor)}</div>
                    <div class="alert-item__desc">${d.tipo === 'fixa' ? 'Fixa' : 'Variável'} · ${dateRelative(d.data)}</div>
                  </div>
                  <button class="icon-btn" data-del-despesa aria-label="Excluir despesa">${icon('trash', 15)}</button>
                </div>`).join('')
              : `<div class="empty-state" style="padding:var(--sp-8)"><p class="text-2">Nenhuma despesa no período.</p></div>`}
            </div>
          </div>
        </section>
      `;

      /* gráfico de fluxo (2 séries — identidade fixa nos slots validados) */
      const series = [
        { name: 'Entradas', values: plotBuckets.map((b) => b.entradas), color: 'var(--chart-1)' },
        { name: 'Saídas', values: plotBuckets.map((b) => b.saidas), color: 'var(--chart-3)' },
      ];
      legend(bodyEl.querySelector('[data-legend]'), series);
      barChart(bodyEl.querySelector('[data-chart]'), {
        labels: plotBuckets.map((b) => b.label),
        series,
        fmt: (v) => money(v),
      });

      /* eventos */
      bodyEl.querySelectorAll('[data-periodo]').forEach((c) =>
        c.addEventListener('click', () => { state.periodo = c.dataset.periodo; paint(); }));

      bodyEl.querySelectorAll('[data-del-venda]').forEach((b) =>
        b.addEventListener('click', async () => {
          const id = b.closest('[data-venda-id]').dataset.vendaId;
          const ok = await confirmDialog({
            title: 'Excluir esta venda?',
            message: 'A baixa de estoque já realizada não é desfeita automaticamente.',
            confirmLabel: 'Excluir', danger: true,
          });
          if (ok) { await db.remove('vendas', id); toast.success('Venda excluída'); }
        }));

      bodyEl.querySelectorAll('[data-del-despesa]').forEach((b) =>
        b.addEventListener('click', async () => {
          const id = b.closest('[data-despesa-id]').dataset.despesaId;
          const ok = await confirmDialog({
            title: 'Excluir esta despesa?', confirmLabel: 'Excluir', danger: true,
          });
          if (ok) { await db.remove('despesas', id); toast.success('Despesa excluída'); }
        }));
    };

    await paint();
    offDb = bus.on('db:changed', ({ collection }) => {
      if (['vendas', 'despesas', 'produtos', 'ingredientes', 'settings', '*'].includes(collection)) paint();
    });
  },

  destroy() {
    offDb?.(); offDb = null;
  },
};
