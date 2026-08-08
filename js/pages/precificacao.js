/**
 * CMV Pro — Precificação
 * ----------------------
 * Compara o preço atual de cada produto com os preços recomendados (ideal,
 * mínimo e psicológico) já descontando a comissão do canal, estima o ganho
 * mensal de corrigir os subprecificados (com base nas vendas de 30 dias) e
 * permite APLICAR o preço sugerido com um clique.
 */

import { db } from '../services/db.js';
import { custoPorcao, analisarCanal, precosSugeridos } from '../services/calc.js';
import { money, pct, esc } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { emptyState, tableSkeleton, pageHead, kpiCard } from '../components/ui.js';
import { bus } from '../core/events.js';
import { navigate } from '../core/router.js';

const state = { canal: 'balcao' };

let offDb = null;

export default {
  async render(container, ctx) {
    container.innerHTML = pageHead({
      title: 'Precificação',
      subtitle: 'Preço recomendado por canal, com comissões e metas de margem já descontadas.',
    }) + `<div data-body>${tableSkeleton()}</div>`;

    const bodyEl = container.querySelector('[data-body]');

    const paint = async () => {
      const [produtos, ingredientes, vendas, settings] = await Promise.all([
        db.all('produtos'), db.all('ingredientes'), db.all('vendas'), db.getSettings(),
      ]);
      const ingMap = new Map(ingredientes.map((i) => [i.id, i]));
      const canais = settings?.canais ?? {};
      const cfg = canais[state.canal] ?? { nome: state.canal, comissao: 0 };

      // Vendas dos últimos 30 dias por produto/canal (para estimar impacto)
      const corte = Date.now() - 30 * 86_400_000;
      const qtd30 = new Map();
      for (const v of vendas) {
        if (v.canal !== state.canal || new Date(v.data).getTime() < corte) continue;
        qtd30.set(v.produtoId, (qtd30.get(v.produtoId) ?? 0) + v.qtd);
      }

      const linhas = produtos
        .filter((p) => p.ficha?.itens?.length)
        .map((p) => {
          const custo = custoPorcao(p, ingMap);
          const atual = p.precos?.[state.canal] ?? null;
          const sug = precosSugeridos(custo, {
            margemIdeal: p.margemIdeal ?? 65,
            margemMinima: p.margemMinima ?? 50,
            comissao: cfg.comissao ?? 0,
            embalagem: p.taxaEmbalagem ?? 0,
          });
          const margemAtual = atual
            ? analisarCanal(custo, atual, { comissao: cfg.comissao ?? 0, embalagem: p.taxaEmbalagem ?? 0 }).margemPct
            : null;
          // status: sem preço | abaixo do mínimo | ajustável | ok
          let status = 'ok';
          if (atual == null) status = 'sem-preco';
          else if (atual < sug.minimo) status = 'abaixo';
          else if (atual < sug.ideal) status = 'ajustavel';
          return { produto: p, custo, atual, sug, margemAtual, status, vendas30: qtd30.get(p.id) ?? 0 };
        })
        .sort((a, b) => {
          const peso = { 'sem-preco': 1, abaixo: 0, ajustavel: 2, ok: 3 };
          return peso[a.status] - peso[b.status];
        });

      if (!linhas.length) {
        bodyEl.innerHTML = emptyState({
          iconName: 'coins',
          title: 'Sem produtos para precificar',
          text: 'Monte as fichas técnicas primeiro — a precificação parte do custo real de cada produto.',
          actionLabel: 'Ir para Fichas Técnicas',
          actionId: 'go-fichas',
        });
        bodyEl.querySelector('#go-fichas')?.addEventListener('click', () => navigate('fichas'));
        return;
      }

      const abaixo = linhas.filter((r) => r.status === 'abaixo');
      // Potencial: subprecificados vendendo ao preço psicológico sugerido
      const potencialMes = abaixo.reduce(
        (s, r) => s + r.vendas30 * Math.max(0, r.sug.psicologico - (r.atual ?? 0)), 0);

      const statusBadge = {
        'sem-preco': '<span class="badge badge--neutral">Sem preço</span>',
        abaixo: '<span class="badge badge--danger">Abaixo do mínimo</span>',
        ajustavel: '<span class="badge badge--warning">Pode subir</span>',
        ok: '<span class="badge badge--success">Saudável</span>',
      };

      bodyEl.innerHTML = `
        <div class="toolbar anim-in">
          <div class="toolbar__filters" role="tablist" aria-label="Canal de venda">
            ${Object.entries(canais).map(([id, c]) => `
              <button class="chip ${state.canal === id ? 'is-active' : ''}" data-canal="${id}" role="tab"
                aria-selected="${state.canal === id}">
                ${esc(c.nome)}${c.comissao ? ` · ${c.comissao}%` : ''}
              </button>`).join('')}
          </div>
        </div>

        <section class="grid grid--kpi" style="margin-bottom:var(--sp-4)">
          ${kpiCard({
            label: 'Abaixo da margem mínima',
            value: String(abaixo.length),
            hint: `de ${linhas.length} produto(s) em ${cfg.nome}`,
          })}
          ${kpiCard({
            label: 'Potencial de ganho / mês',
            value: money(potencialMes),
            hint: 'corrigindo os subprecificados',
          })}
          ${kpiCard({
            label: 'Comissão do canal',
            value: pct(cfg.comissao ?? 0),
            hint: 'já descontada nas sugestões',
          })}
        </section>

        <div class="card anim-in">
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th class="cell-num">Custo</th>
                  <th class="cell-num">Preço atual</th>
                  <th class="cell-num">Margem atual</th>
                  <th class="cell-num">Mínimo</th>
                  <th class="cell-num">Ideal</th>
                  <th class="cell-num">Psicológico</th>
                  <th>Status</th>
                  <th class="cell-actions"><span class="sr-only">Aplicar</span></th>
                </tr>
              </thead>
              <tbody>
                ${linhas.map((r, i) => `
                  <tr data-i="${i}">
                    <td><span class="entity__name">${esc(r.produto.nome)}</span></td>
                    <td class="cell-num text-2">${money(r.custo)}</td>
                    <td class="cell-num"><strong>${r.atual != null ? money(r.atual) : '—'}</strong></td>
                    <td class="cell-num ${r.status === 'abaixo' ? 'text-danger' : ''}">
                      ${r.margemAtual != null ? pct(r.margemAtual) : '<span class="text-3">—</span>'}
                    </td>
                    <td class="cell-num text-2">${money(r.sug.minimo)}</td>
                    <td class="cell-num text-2">${money(r.sug.ideal)}</td>
                    <td class="cell-num"><strong class="text-success">${money(r.sug.psicologico)}</strong></td>
                    <td>${statusBadge[r.status]}</td>
                    <td class="cell-actions">
                      ${r.status !== 'ok' ? `
                        <button class="btn btn--sm btn--secondary" data-aplicar
                          title="Definir ${money(r.sug.psicologico)} como preço de ${esc(cfg.nome)}">
                          Aplicar ${money(r.sug.psicologico)}
                        </button>` : ''}
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <p class="text-3" style="margin-top:var(--sp-3);font-size:var(--text-sm)">
          Sugestões calculadas sobre o custo da ficha + taxa de embalagem, líquidas da comissão de ${pct(cfg.comissao ?? 0)} do canal.
        </p>
      `;

      bodyEl.querySelectorAll('[data-canal]').forEach((c) =>
        c.addEventListener('click', () => { state.canal = c.dataset.canal; paint(); }));

      bodyEl.querySelectorAll('[data-aplicar]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          const r = linhas[Number(btn.closest('tr').dataset.i)];
          const ok = await confirmDialog({
            title: `Aplicar ${money(r.sug.psicologico)} em ${r.produto.nome}?`,
            message: `O preço de ${cfg.nome} passa de ${r.atual != null ? money(r.atual) : '—'} para ${money(r.sug.psicologico)}.`,
            confirmLabel: 'Aplicar preço',
          });
          if (!ok) return;
          await db.update('produtos', r.produto.id, {
            precos: { ...(r.produto.precos ?? {}), [state.canal]: r.sug.psicologico },
          });
          toast.success('Preço atualizado', `${r.produto.nome} · ${cfg.nome}: ${money(r.sug.psicologico)}`);
        }));
    };

    await paint();
    offDb = bus.on('db:changed', ({ collection }) => {
      if (['produtos', 'ingredientes', 'settings', '*'].includes(collection)) paint();
    });
  },

  destroy() {
    offDb?.(); offDb = null;
  },
};
