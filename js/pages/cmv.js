/**
 * CMV Pro — Análise de CMV
 * ------------------------
 * Visão analítica por canal de venda: CMV %, CMV R$, markup, margem e lucro
 * de cada produto, com meta da empresa destacada e exportação CSV.
 */

import { db } from '../services/db.js';
import { custoPorcao, analisarCanal } from '../services/calc.js';
import { money, pct, num, esc } from '../utils/format.js';
import { downloadCsv } from '../utils/csv.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { emptyState, tableSkeleton, pageHead, kpiCard } from '../components/ui.js';
import { bus } from '../core/events.js';
import { navigate } from '../core/router.js';

const state = { canal: 'balcao' };

let offDb = null;

export default {
  async render(container, ctx) {
    container.innerHTML = pageHead({
      title: 'CMV',
      subtitle: 'Quanto do preço de venda vira custo — produto a produto, canal a canal.',
      actions: `<button class="btn btn--secondary" data-export>${icon('download', 17)} Exportar CSV</button>`,
    }) + `<div data-body>${tableSkeleton()}</div>`;

    const bodyEl = container.querySelector('[data-body]');
    let linhasExport = [];

    container.querySelector('[data-export]').addEventListener('click', () => {
      if (!linhasExport.length) {
        toast.info('Nada para exportar', 'Nenhum produto com ficha e preço neste canal.');
        return;
      }
      downloadCsv(
        `cmv-${state.canal}.csv`,
        ['produto', 'preco', 'custo', 'cmv_pct', 'markup', 'margem_pct', 'lucro'],
        linhasExport.map((r) => [
          r.nome, String(r.preco).replace('.', ','), String(r.custo.toFixed(2)).replace('.', ','),
          String(r.cmvPct.toFixed(1)).replace('.', ','), String(r.markup.toFixed(2)).replace('.', ','),
          String(r.margemPct.toFixed(1)).replace('.', ','), String(r.lucro.toFixed(2)).replace('.', ','),
        ])
      );
      toast.success('CSV exportado', `${linhasExport.length} produto(s).`);
    });

    const paint = async () => {
      const [produtos, ingredientes, settings] = await Promise.all([
        db.all('produtos'), db.all('ingredientes'), db.getSettings(),
      ]);
      const ingMap = new Map(ingredientes.map((i) => [i.id, i]));
      const canais = settings?.canais ?? {};
      const metaCmv = settings?.metas?.cmvMax ?? 35;
      const cfg = canais[state.canal] ?? { nome: state.canal, comissao: 0 };

      // Analisa cada produto com ficha e preço no canal selecionado
      const linhas = produtos
        .filter((p) => p.ficha?.itens?.length && p.precos?.[state.canal])
        .map((p) => {
          const custo = custoPorcao(p, ingMap);
          const preco = p.precos[state.canal];
          const a = analisarCanal(custo, preco, {
            comissao: cfg.comissao ?? 0,
            embalagem: p.taxaEmbalagem ?? 0,
          });
          return { id: p.id, nome: p.nome, preco, custo, ...a };
        })
        .sort((a, b) => b.cmvPct - a.cmvPct);

      linhasExport = linhas;

      const semDados = produtos.length - linhas.length;

      if (!produtos.length) {
        bodyEl.innerHTML = emptyState({
          iconName: 'percent',
          title: 'Sem produtos para analisar',
          text: 'Cadastre produtos com ficha técnica e preço para ver o CMV de cada um.',
          actionLabel: 'Ir para Produtos',
          actionId: 'go-prod',
        });
        bodyEl.querySelector('#go-prod')?.addEventListener('click', () => navigate('produtos'));
        return;
      }

      const media = linhas.length
        ? linhas.reduce((s, r) => s + r.cmvPct, 0) / linhas.length : 0;
      const acima = linhas.filter((r) => r.cmvPct > metaCmv);
      const maisRentavel = [...linhas].sort((a, b) => b.lucro - a.lucro)[0];

      const statusBadge = (r) => {
        if (r.lucro <= 0) return `<span class="badge badge--danger">Prejuízo</span>`;
        if (r.cmvPct > metaCmv) return `<span class="badge badge--warning">Acima da meta</span>`;
        return `<span class="badge badge--success">Saudável</span>`;
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
            label: `CMV médio — ${cfg.nome}`,
            value: pct(media),
            hint: `meta ≤ ${metaCmv}%`,
          })}
          ${kpiCard({
            label: 'Acima da meta',
            value: String(acima.length),
            hint: `de ${linhas.length} produto(s)`,
          })}
          ${kpiCard({
            label: 'Mais rentável',
            value: maisRentavel ? esc(maisRentavel.nome) : '—',
            hint: maisRentavel ? `lucro de ${money(maisRentavel.lucro)} por venda` : '',
          })}
        </section>

        ${linhas.length ? `
        <div class="card anim-in">
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th class="cell-num">Preço</th>
                  <th class="cell-num">Custo (CMV R$)</th>
                  <th class="cell-num">CMV %</th>
                  <th class="cell-num">Markup</th>
                  <th class="cell-num">Margem</th>
                  <th class="cell-num">Lucro</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${linhas.map((r) => `
                  <tr>
                    <td><span class="entity__name">${esc(r.nome)}</span></td>
                    <td class="cell-num">${money(r.preco)}</td>
                    <td class="cell-num text-2">${money(r.custo)}</td>
                    <td class="cell-num">
                      <strong class="${r.lucro <= 0 ? 'text-danger' : r.cmvPct > metaCmv ? 'text-warning' : 'text-success'}">
                        ${pct(r.cmvPct)}
                      </strong>
                    </td>
                    <td class="cell-num text-2">${num(r.markup)}×</td>
                    <td class="cell-num">${pct(r.margemPct)}</td>
                    <td class="cell-num ${r.lucro <= 0 ? 'text-danger' : ''}">${money(r.lucro)}</td>
                    <td>${statusBadge(r)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        ${semDados ? `
          <p class="text-3" style="margin-top:var(--sp-3);font-size:var(--text-sm)">
            ${semDados} produto(s) fora da análise por não ter ficha técnica ou preço em ${esc(cfg.nome)}.
          </p>` : ''}`
        : emptyState({
            iconName: 'percent',
            title: `Nenhum produto com preço em ${cfg.nome}`,
            text: 'Defina o preço deste canal no cadastro dos produtos para analisá-los aqui.',
          })}
      `;

      bodyEl.querySelectorAll('[data-canal]').forEach((c) =>
        c.addEventListener('click', () => { state.canal = c.dataset.canal; paint(); }));
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
