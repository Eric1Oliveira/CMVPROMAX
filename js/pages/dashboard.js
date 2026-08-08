/**
 * CMV Pro — Dashboard
 * -------------------
 * Visão executiva do negócio: receita, lucro, CMV médio, margem, alertas
 * inteligentes, gráficos semanais/mensais e rankings de margem por produto.
 * Recalcula tudo em tempo real quando os dados mudam (bus 'db:changed').
 */

import { db } from '../services/db.js';
import {
  resumirVendas, serieDiaria, serieSemanal, rankingMargem, gerarAlertas,
} from '../services/calc.js';
import { money, pct, esc, greeting } from '../utils/format.js';
import { kpiCard, dashSkeleton, emptyState } from '../components/ui.js';
import { lineChart, barChart, legend, sparkline } from '../components/charts.js';
import { icon } from '../components/icons.js';
import { bus } from '../core/events.js';
import { navigate } from '../core/router.js';

let offDb = null;   // cancelamento do listener de dados
let offTheme = null;

export default {
  async render(container, ctx) {
    // Skeleton imediato: percepção de velocidade
    container.innerHTML = dashSkeleton();

    const paint = async () => {
      /* ------------------------- carga de dados ------------------------- */
      const [vendas, produtos, ingredientes, settings] = await Promise.all([
        db.all('vendas'), db.all('produtos'), db.all('ingredientes'), db.getSettings(),
      ]);

      if (!produtos.length && !ingredientes.length) {
        container.innerHTML = emptyState({
          iconName: 'sparkles',
          title: 'Comece cadastrando seus ingredientes',
          text: 'Com ingredientes e fichas técnicas, o CMV Pro calcula seus custos e margens automaticamente.',
          actionLabel: 'Cadastrar ingrediente',
          actionId: 'go-ing',
        }) + `
          <div style="text-align:center;margin-top:calc(var(--sp-6) * -1);padding-bottom:var(--sp-8)">
            <button class="btn btn--ghost" id="go-seed">Ou carregar dados de demonstração</button>
          </div>`;
        container.querySelector('#go-ing')?.addEventListener('click', () => navigate('ingredientes'));
        container.querySelector('#go-seed')?.addEventListener('click', async (e) => {
          // captura o botão ANTES de qualquer await: e.currentTarget
          // vira null quando o evento termina de ser despachado
          const btn = e.currentTarget;
          const { btnLoading } = await import('../components/ui.js');
          const restore = btnLoading(btn, 'Carregando demo…');
          try {
            const { seedDemo } = await import('../services/seed.js');
            await seedDemo();
            // 'db:changed' re-renderiza o dashboard automaticamente
          } catch (err) {
            restore();
            console.error('[seed]', err);
            const { toast } = await import('../components/toast.js');
            toast.error('Não foi possível carregar a demo', err.message);
          }
        });
        return;
      }

      /* ------------------------ janelas de análise ---------------------- */
      const now = Date.now();
      const nDias = (n) => now - n * 86_400_000;
      const ultimos7 = vendas.filter((v) => new Date(v.data).getTime() >= nDias(7));
      const anteriores7 = vendas.filter((v) => {
        const t = new Date(v.data).getTime();
        return t >= nDias(14) && t < nDias(7);
      });

      const atual = resumirVendas(ultimos7, produtos, ingredientes, settings);
      const anterior = resumirVendas(anteriores7, produtos, ingredientes, settings);
      const delta = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);

      const dias = serieDiaria(vendas, produtos, ingredientes, 7);
      const semanas = serieSemanal(vendas, produtos, ingredientes, 8);
      const ranking = rankingMargem(produtos, ingredientes, settings);
      const alertas = gerarAlertas({ ingredientes, produtos, settings });
      const metaCmv = settings?.metas?.cmvMax ?? 35;

      /* ----------------------------- markup ----------------------------- */
      container.innerHTML = `
        <div class="dash-hello anim-in" style="margin-bottom:var(--sp-5)">
          <h1>${greeting()} 👋</h1>
          <p>Resumo dos últimos 7 dias — ${esc(settings?.empresa ?? '')}</p>
        </div>

        <section class="grid grid--kpi" style="margin-bottom:var(--sp-4)" aria-label="Indicadores">
          ${kpiCard({
            label: 'Receita', value: money(atual.receita),
            delta: delta(atual.receita, anterior.receita),
            hint: 'vs semana anterior', sparkId: 'spark-receita',
          })}
          ${kpiCard({
            label: 'Lucro bruto', value: money(atual.lucro),
            delta: delta(atual.lucro, anterior.lucro),
            hint: 'vs semana anterior',
          })}
          ${kpiCard({
            label: 'CMV médio', value: pct(atual.cmvPct),
            delta: delta(atual.cmvPct, anterior.cmvPct), deltaGoodWhenUp: false,
            hint: `meta ≤ ${metaCmv}%`,
          })}
          ${kpiCard({
            label: 'Margem média', value: pct(atual.margemPct),
            delta: delta(atual.margemPct, anterior.margemPct),
            hint: 'sobre a receita',
          })}
        </section>

        <section class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr));margin-bottom:var(--sp-4)">
          <div class="card kpi anim-in">
            <span class="kpi__label">${icon('package', 15)} Produtos</span>
            <span class="kpi__value tnum" style="font-size:var(--text-2xl)">${produtos.length}</span>
          </div>
          <div class="card kpi anim-in">
            <span class="kpi__label">${icon('carrot', 15)} Ingredientes</span>
            <span class="kpi__value tnum" style="font-size:var(--text-2xl)">${ingredientes.length}</span>
          </div>
          <div class="card kpi anim-in">
            <span class="kpi__label">${icon('alert-triangle', 15)} Alertas</span>
            <span class="kpi__value tnum" style="font-size:var(--text-2xl);${alertas.length ? 'color:var(--warning)' : ''}">${alertas.length}</span>
          </div>
          <div class="card kpi anim-in">
            <span class="kpi__label">${icon('trending-down', 15)} Sem lucro</span>
            <span class="kpi__value tnum" style="font-size:var(--text-2xl);${ranking.some((r) => r.lucro <= 0) ? 'color:var(--danger)' : ''}">
              ${ranking.filter((r) => r.lucro <= 0).length}
            </span>
          </div>
        </section>

        <section class="grid grid--2" style="margin-bottom:var(--sp-4)">
          <div class="card anim-in">
            <div class="chart-card__head">
              <h2>Vendas da semana</h2>
              <span class="badge badge--neutral">7 dias</span>
            </div>
            <div class="chart-card__legend" data-legend-semana></div>
            <div class="chart-card__plot" data-chart-semana></div>
          </div>
          <div class="card anim-in">
            <div class="chart-card__head">
              <h2>Evolução mensal</h2>
              <span class="badge badge--neutral">8 semanas</span>
            </div>
            <div class="chart-card__legend" data-legend-mes></div>
            <div class="chart-card__plot" data-chart-mes></div>
          </div>
        </section>

        <section class="grid grid--2" style="margin-bottom:var(--sp-4)">
          <div class="card anim-in">
            <div class="card__head">
              <h2>Alertas inteligentes</h2>
              ${alertas.length ? `<span class="badge badge--warning">${alertas.length}</span>` : ''}
            </div>
            <div class="card__body card__body--flush">
              ${alertas.length ? alertas.slice(0, 6).map((a) => `
                <div class="alert-item">
                  <div class="alert-item__icon alert-item__icon--${a.nivel}">
                    ${icon(a.nivel === 'info' ? 'info' : 'alert-triangle', 16)}
                  </div>
                  <div>
                    <div class="alert-item__title">${esc(a.titulo)}</div>
                    <div class="alert-item__desc">${esc(a.desc)}</div>
                  </div>
                </div>`).join('')
              : `<div class="empty-state" style="padding:var(--sp-8)">
                   <div class="empty-state__icon" style="color:var(--success);background:var(--success-soft)">${icon('check-circle', 24)}</div>
                   <h3>Tudo em ordem</h3><p>Nenhum alerta no momento.</p>
                 </div>`}
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
            <div class="card anim-in">
              <div class="card__head"><h2>Melhores margens</h2></div>
              <div class="rank-list">
                ${ranking.slice(0, 3).map((r, i) => `
                  <div class="rank-item">
                    <span class="rank-item__pos">${i + 1}</span>
                    <span class="rank-item__name truncate">${esc(r.produto.nome)}</span>
                    <span class="rank-item__value text-success">${pct(r.margemPct)}</span>
                  </div>`).join('')}
              </div>
            </div>
            <div class="card anim-in">
              <div class="card__head"><h2>Piores margens</h2></div>
              <div class="rank-list">
                ${[...ranking].reverse().slice(0, 3).map((r) => `
                  <div class="rank-item">
                    <span class="rank-item__pos">!</span>
                    <span class="rank-item__name truncate">${esc(r.produto.nome)}</span>
                    <span class="rank-item__value ${r.lucro <= 0 ? 'text-danger' : 'text-warning'}">${pct(r.margemPct)}</span>
                  </div>`).join('')}
              </div>
            </div>
          </div>
        </section>
      `;

      /* --------------------------- gráficos ----------------------------- */
      const brl = (v) => money(v);

      // Séries: identidade fixa — receita sempre slot 1, custo sempre slot 2
      const sSemana = [
        { name: 'Receita', values: dias.map((d) => d.receita), color: 'var(--chart-1)' },
        { name: 'Custo', values: dias.map((d) => d.custo), color: 'var(--chart-2)' },
      ];
      legend(container.querySelector('[data-legend-semana]'), sSemana);
      barChart(container.querySelector('[data-chart-semana]'), {
        labels: dias.map((d) => d.label), series: sSemana, fmt: brl,
      });

      const sMes = [
        { name: 'Receita', values: semanas.map((s) => s.receita), color: 'var(--chart-1)' },
        { name: 'Custo', values: semanas.map((s) => s.custo), color: 'var(--chart-2)' },
      ];
      legend(container.querySelector('[data-legend-mes]'), sMes);
      lineChart(container.querySelector('[data-chart-mes]'), {
        labels: semanas.map((s) => s.label), series: sMes, fmt: brl,
      });

      // Sparkline de receita no KPI principal
      const sparkEl = container.querySelector('#spark-receita');
      if (sparkEl) sparkline(sparkEl, dias.map((d) => d.receita));
    };

    await paint();

    /* Recalcula quando dados ou tema mudarem (cores dos SVGs são var(),
       mas o canvas de tooltip/realce se beneficia do re-render limpo). */
    offDb = bus.on('db:changed', paint);
    offTheme = bus.on('theme:changed', paint);
  },

  destroy() {
    offDb?.(); offDb = null;
    offTheme?.(); offTheme = null;
  },
};
