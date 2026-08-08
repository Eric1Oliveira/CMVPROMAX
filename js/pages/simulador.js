/**
 * CMV Pro — Simulador de cenários
 * -------------------------------
 * Três perguntas que todo dono de restaurante faz, respondidas na hora:
 *   1. "E se um insumo mudar de preço?"  → impacto no custo/CMV dos produtos
 *   2. "E se eu vender por outro canal?" → lucro e margem canal a canal
 *   3. "E se eu quiser margem de X%?"    → preço necessário em cada canal
 * Tudo em memória — nada é salvo; ajuste os controles e veja o efeito.
 */

import { db } from '../services/db.js';
import { custoPorcao, analisarCanal, custoUnitario } from '../services/calc.js';
import { money, pct, esc, num } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { barChart } from '../components/charts.js';
import { emptyState, pageHead, dashSkeleton } from '../components/ui.js';
import { navigate } from '../core/router.js';

export default {
  async render(container, ctx) {
    container.innerHTML = pageHead({
      title: 'Simulador',
      subtitle: 'Teste cenários antes de decidir — nada aqui altera seus dados.',
    }) + `<div data-body>${dashSkeleton()}</div>`;

    const bodyEl = container.querySelector('[data-body]');

    const [produtos, ingredientes, settings] = await Promise.all([
      db.all('produtos'), db.all('ingredientes'), db.getSettings(),
    ]);
    const ingMap = new Map(ingredientes.map((i) => [i.id, i]));
    const canais = settings?.canais ?? {};
    const metaCmv = settings?.metas?.cmvMax ?? 35;
    const comFicha = produtos.filter((p) => p.ficha?.itens?.length);

    if (!comFicha.length || !ingredientes.length) {
      bodyEl.innerHTML = emptyState({
        iconName: 'flask',
        title: 'Nada para simular ainda',
        text: 'O simulador usa as fichas técnicas dos produtos. Monte ao menos uma para começar.',
        actionLabel: 'Ir para Fichas Técnicas',
        actionId: 'go-fichas',
      });
      bodyEl.querySelector('#go-fichas')?.addEventListener('click', () => navigate('fichas'));
      return;
    }

    /* Ingredientes ordenados por relevância (mais usados primeiro) */
    const usoIng = new Map();
    for (const p of comFicha) {
      for (const it of p.ficha.itens) {
        usoIng.set(it.ingredienteId, (usoIng.get(it.ingredienteId) ?? 0) + 1);
      }
    }
    const ingOrdenados = [...ingredientes]
      .sort((a, b) => (usoIng.get(b.id) ?? 0) - (usoIng.get(a.id) ?? 0));

    bodyEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--sp-4)">

        <!-- 1. Variação de insumo -->
        <div class="card anim-in">
          <div class="card__head">
            <h2>${icon('trending-up', 18)} E se um insumo mudar de preço?</h2>
          </div>
          <div class="card__body">
            <div class="form-grid" style="margin-bottom:var(--sp-4)">
              <div class="field">
                <label class="field__label">Insumo</label>
                <select class="input" data-s1-ing>
                  ${ingOrdenados.map((i) => `
                    <option value="${i.id}">${esc(i.nome)}${usoIng.get(i.id) ? ` — em ${usoIng.get(i.id)} produto(s)` : ''}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label class="field__label">Variação de preço: <strong data-s1-label>+10%</strong></label>
                <input type="range" data-s1-pct min="-50" max="100" step="5" value="10"
                  style="width:100%;accent-color:var(--primary)" aria-label="Variação percentual do preço" />
                <span class="field__hint">Arraste: de −50% (caiu) a +100% (dobrou).</span>
              </div>
            </div>
            <div data-s1-result></div>
          </div>
        </div>

        <!-- 2. Comparar canais -->
        <div class="card anim-in">
          <div class="card__head">
            <h2>${icon('layers', 18)} E se eu vender por outro canal?</h2>
          </div>
          <div class="card__body">
            <div class="field" style="max-width:420px;margin-bottom:var(--sp-4)">
              <label class="field__label">Produto</label>
              <select class="input" data-s2-prod>
                ${comFicha.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}
              </select>
            </div>
            <div class="chart-card__plot" data-s2-chart style="padding:0 0 var(--sp-3)"></div>
            <div data-s2-result></div>
          </div>
        </div>

        <!-- 3. Margem alvo -->
        <div class="card anim-in">
          <div class="card__head">
            <h2>${icon('percent', 18)} E se eu quiser uma margem de…</h2>
          </div>
          <div class="card__body">
            <div class="form-grid" style="margin-bottom:var(--sp-4)">
              <div class="field">
                <label class="field__label">Produto</label>
                <select class="input" data-s3-prod>
                  ${comFicha.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label class="field__label">Margem desejada: <strong data-s3-label>30%</strong></label>
                <input type="range" data-s3-pct min="5" max="80" step="5" value="30"
                  style="width:100%;accent-color:var(--primary)" aria-label="Margem desejada" />
              </div>
            </div>
            <div data-s3-result></div>
          </div>
        </div>
      </div>
    `;

    /* ==================== 1. Variação de insumo ==================== */

    const s1Ing = bodyEl.querySelector('[data-s1-ing]');
    const s1Pct = bodyEl.querySelector('[data-s1-pct]');
    const s1Label = bodyEl.querySelector('[data-s1-label]');
    const s1Result = bodyEl.querySelector('[data-s1-result]');

    function simular1() {
      const varPct = Number(s1Pct.value);
      s1Label.textContent = `${varPct > 0 ? '+' : ''}${varPct}%`;

      const ing = ingMap.get(s1Ing.value);
      if (!ing) return;

      // Mapa alternativo com o preço do insumo alterado
      const mapNovo = new Map(ingMap);
      mapNovo.set(ing.id, { ...ing, preco: ing.preco * (1 + varPct / 100) });

      const afetados = comFicha
        .filter((p) => p.ficha.itens.some((it) => it.ingredienteId === ing.id))
        .map((p) => {
          const antes = custoPorcao(p, ingMap);
          const depois = custoPorcao(p, mapNovo);
          const preco = p.precos?.balcao ?? 0;
          const cmvAntes = preco ? (antes / preco) * 100 : null;
          const cmvDepois = preco ? (depois / preco) * 100 : null;
          return { p, antes, depois, cmvAntes, cmvDepois };
        });

      if (!afetados.length) {
        s1Result.innerHTML = `<p class="text-2">Nenhum produto usa <strong>${esc(ing.nome)}</strong> na ficha técnica.</p>`;
        return;
      }

      const mediaPP = afetados.filter((a) => a.cmvAntes != null)
        .reduce((s, a) => s + (a.cmvDepois - a.cmvAntes), 0) /
        Math.max(1, afetados.filter((a) => a.cmvAntes != null).length);

      s1Result.innerHTML = `
        <p class="text-2" style="margin-bottom:var(--sp-3)">
          ${esc(ing.nome)}: ${money(ing.preco)} → <strong>${money(ing.preco * (1 + varPct / 100))}</strong>
          a embalagem · afeta <strong>${afetados.length} produto(s)</strong>
          ${Number.isFinite(mediaPP) && afetados.some((a) => a.cmvAntes != null)
            ? ` · CMV médio ${mediaPP >= 0 ? 'sobe' : 'cai'} ${num(Math.abs(mediaPP))} p.p.` : ''}
        </p>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Produto</th>
                <th class="cell-num">Custo hoje</th>
                <th class="cell-num">Custo no cenário</th>
                <th class="cell-num">CMV hoje</th>
                <th class="cell-num">CMV no cenário</th>
              </tr>
            </thead>
            <tbody>
              ${afetados.map(({ p, antes, depois, cmvAntes, cmvDepois }) => `
                <tr>
                  <td><span class="entity__name">${esc(p.nome)}</span></td>
                  <td class="cell-num text-2">${money(antes)}</td>
                  <td class="cell-num"><strong>${money(depois)}</strong></td>
                  <td class="cell-num text-2">${cmvAntes != null ? pct(cmvAntes) : '—'}</td>
                  <td class="cell-num">
                    ${cmvDepois != null ? `
                      <strong class="${cmvDepois > metaCmv ? 'text-danger' : 'text-success'}">${pct(cmvDepois)}</strong>` : '—'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    s1Ing.addEventListener('change', simular1);
    s1Pct.addEventListener('input', simular1);
    simular1();

    /* ==================== 2. Comparar canais ==================== */

    const s2Prod = bodyEl.querySelector('[data-s2-prod]');
    const s2Chart = bodyEl.querySelector('[data-s2-chart]');
    const s2Result = bodyEl.querySelector('[data-s2-result]');

    function simular2() {
      const p = comFicha.find((x) => x.id === s2Prod.value);
      if (!p) return;
      const custo = custoPorcao(p, ingMap);
      const base = p.precos?.balcao ?? 0;

      const linhas = Object.entries(canais).map(([id, cfg]) => {
        // usa o preço do canal; sem preço definido, simula com o de balcão
        const preco = p.precos?.[id] ?? base;
        const simulado = p.precos?.[id] == null;
        const a = analisarCanal(custo, preco, {
          comissao: cfg.comissao ?? 0,
          embalagem: p.taxaEmbalagem ?? 0,
        });
        return { id, nome: cfg.nome, comissao: cfg.comissao ?? 0, preco, simulado, ...a };
      }).filter((r) => r.preco > 0);

      if (!linhas.length) {
        s2Chart.innerHTML = '';
        s2Result.innerHTML = '<p class="text-2">Defina ao menos o preço de balcão deste produto para comparar canais.</p>';
        return;
      }

      barChart(s2Chart, {
        labels: linhas.map((r) => r.nome),
        series: [{ name: 'Lucro por venda', values: linhas.map((r) => Math.max(0, r.lucro)), color: 'var(--chart-1)' }],
        fmt: (v) => money(v),
      });

      s2Result.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Canal</th><th class="cell-num">Preço</th><th class="cell-num">Comissão</th>
                <th class="cell-num">CMV</th><th class="cell-num">Margem</th><th class="cell-num">Lucro</th>
              </tr>
            </thead>
            <tbody>
              ${linhas.map((r) => `
                <tr>
                  <td>${esc(r.nome)} ${r.simulado ? '<span class="badge badge--neutral" title="Sem preço definido — simulando com o preço de balcão">simulado</span>' : ''}</td>
                  <td class="cell-num">${money(r.preco)}</td>
                  <td class="cell-num text-2">${pct(r.comissao)}</td>
                  <td class="cell-num text-2">${pct(r.cmvPct)}</td>
                  <td class="cell-num">${pct(r.margemPct)}</td>
                  <td class="cell-num"><strong class="${r.lucro <= 0 ? 'text-danger' : 'text-success'}">${money(r.lucro)}</strong></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    s2Prod.addEventListener('change', simular2);
    simular2();

    /* ==================== 3. Margem alvo ==================== */

    const s3Prod = bodyEl.querySelector('[data-s3-prod]');
    const s3Pct = bodyEl.querySelector('[data-s3-pct]');
    const s3Label = bodyEl.querySelector('[data-s3-label]');
    const s3Result = bodyEl.querySelector('[data-s3-result]');

    function simular3() {
      const margem = Number(s3Pct.value);
      s3Label.textContent = `${margem}%`;
      const p = comFicha.find((x) => x.id === s3Prod.value);
      if (!p) return;
      const custo = custoPorcao(p, ingMap);

      const linhas = Object.entries(canais).map(([id, cfg]) => {
        // preço tal que: preço·(1−comissão) − embalagem − custo = margem·preço
        const denom = 1 - (cfg.comissao ?? 0) / 100 - margem / 100;
        const necessario = denom > 0 ? (custo + (p.taxaEmbalagem ?? 0)) / denom : null;
        const atual = p.precos?.[id] ?? null;
        return { nome: cfg.nome, comissao: cfg.comissao ?? 0, necessario, atual };
      });

      s3Result.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Canal</th><th class="cell-num">Preço atual</th>
                <th class="cell-num">Preço p/ margem de ${margem}%</th><th class="cell-num">Diferença</th>
              </tr>
            </thead>
            <tbody>
              ${linhas.map((r) => {
                const diff = r.necessario != null && r.atual != null ? r.necessario - r.atual : null;
                return `
                  <tr>
                    <td>${esc(r.nome)}</td>
                    <td class="cell-num text-2">${r.atual != null ? money(r.atual) : '—'}</td>
                    <td class="cell-num">
                      ${r.necessario != null
                        ? `<strong>${money(r.necessario)}</strong>`
                        : '<span class="badge badge--danger">inviável (comissão + margem ≥ 100%)</span>'}
                    </td>
                    <td class="cell-num">
                      ${diff != null
                        ? `<span class="${diff > 0 ? 'text-warning' : 'text-success'}">${diff > 0 ? '+' : ''}${money(diff)}</span>`
                        : '—'}
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <p class="text-3" style="margin-top:var(--sp-3);font-size:var(--text-sm)">
          Custo da porção: ${money(custo)} + embalagem ${money(p.taxaEmbalagem ?? 0)} · comissão de cada canal já considerada.
        </p>`;
    }

    s3Prod.addEventListener('change', simular3);
    s3Pct.addEventListener('input', simular3);
    simular3();
  },

  destroy() {},
};
