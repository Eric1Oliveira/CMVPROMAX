/**
 * CMV Pro — Ajuda
 * ---------------
 * Primeiros passos, conceitos de gestão (CMV, markup, margem…) e suporte.
 */

import { db } from '../services/db.js';
import { isSupabaseConfigured } from '../config.js';
import { icon } from '../components/icons.js';
import { pageHead } from '../components/ui.js';
import { navigate } from '../core/router.js';

const PASSOS = [
  { rota: 'ingredientes', titulo: 'Cadastre seus ingredientes', desc: 'Preço da embalagem + tamanho = custo real por g/ml/un.', col: 'ingredientes' },
  { rota: 'produtos', titulo: 'Crie os produtos do cardápio', desc: 'Com os preços de cada canal de venda.', col: 'produtos' },
  { rota: 'fichas', titulo: 'Monte as fichas técnicas', desc: 'A receita de cada produto — o CMV nasce aqui.', col: null },
  { rota: 'precificacao', titulo: 'Revise os preços', desc: 'Compare com o ideal e aplique com um clique.', col: null },
  { rota: 'financeiro', titulo: 'Lance as vendas do dia', desc: 'O estoque baixa sozinho pela ficha técnica.', col: 'vendas' },
];

const CONCEITOS = [
  ['O que é CMV?', 'Custo da Mercadoria Vendida: quanto do preço de venda vira custo de insumos. CMV de 35% significa que R$ 35 de cada R$ 100 vendidos pagam ingredientes. Quanto menor, melhor — a meta padrão do mercado de food service fica entre 28% e 35%.'],
  ['O que é markup?', 'Quantas vezes o preço cobre o custo. Custo de R$ 10 vendido a R$ 30 = markup 3×. É o jeito rápido de precificar, mas a margem é o número que paga as contas.'],
  ['Margem × lucro', 'Margem bruta é a porcentagem do preço que sobra após insumos e comissões. Lucro líquido desconta também as despesas fixas (aluguel, folha…). Um produto pode ter margem boa e o negócio ainda dar prejuízo se as despesas forem altas.'],
  ['Perda e rendimento', 'Perda é o que se descarta no preparo (aparas, casca, evaporação) — 10% de perda encarece o insumo em 10%. Rendimento é quantas porções a receita produz; o custo da porção divide por ele.'],
  ['Preço psicológico', 'O preço ideal arredondado para terminar em ,90 — R$ 27,32 vira R$ 27,90. Mesma percepção de valor, margem um pouco maior.'],
  ['Por que o preço do iFood é diferente?', 'Canais com comissão (iFood 25%, por exemplo) entregam menos receita líquida. O CMV Pro desconta a comissão de cada canal na margem e sugere preços específicos por canal.'],
];

export default {
  async render(container, ctx) {
    // status de cada passo (feito/pendente) a partir dos dados reais
    const [ing, prod, vendas] = await Promise.all([
      db.all('ingredientes'), db.all('produtos'), db.all('vendas'),
    ]);
    const temFicha = prod.some((p) => p.ficha?.itens?.length);
    const feito = {
      ingredientes: ing.length > 0,
      produtos: prod.length > 0,
      fichas: temFicha,
      precificacao: temFicha,
      vendas: vendas.length > 0,
    };
    const done = (p) =>
      p.col ? feito[p.col] : p.rota === 'fichas' ? feito.fichas : feito.precificacao;

    container.innerHTML = pageHead({
      title: 'Ajuda',
      subtitle: 'Comece bem e entenda os números que o CMV Pro calcula por você.',
    }) + `
      <div class="grid grid--2" style="align-items:start">

        <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
          <div class="card anim-in">
            <div class="card__head"><h2>${icon('check-circle', 18)} Primeiros passos</h2></div>
            <div class="card__body card__body--flush">
              ${PASSOS.map((p, i) => `
                <button class="alert-item" data-rota="${p.rota}"
                  style="width:100%;text-align:left;cursor:pointer;background:none">
                  <div class="alert-item__icon ${done(p) ? 'alert-item__icon--info' : 'alert-item__icon--warning'}">
                    ${done(p) ? icon('check', 15) : `<strong>${i + 1}</strong>`}
                  </div>
                  <div style="flex:1;min-width:0">
                    <div class="alert-item__title" ${done(p) ? 'style="text-decoration:line-through;color:var(--text-3)"' : ''}>
                      ${p.titulo}
                    </div>
                    <div class="alert-item__desc">${p.desc}</div>
                  </div>
                  ${icon('chevron-right', 16)}
                </button>`).join('')}
            </div>
          </div>

          <div class="card anim-in">
            <div class="card__head"><h2>${icon('info', 18)} Sobre o app</h2></div>
            <div class="card__body" style="display:flex;flex-direction:column;gap:var(--sp-2)">
              <div class="stat-row"><span class="text-2">Versão</span><strong>1.6.0</strong></div>
              <div class="stat-row"><span class="text-2">Armazenamento</span>
                <span class="badge ${isSupabaseConfigured() ? 'badge--success' : 'badge--neutral'}">
                  ${isSupabaseConfigured() ? 'Supabase (nuvem)' : 'Local (este dispositivo)'}
                </span>
              </div>
              <div class="stat-row"><span class="text-2">Atalho de busca</span><strong><kbd style="border:1px solid var(--border);border-radius:5px;padding:1px 7px">/</kbd></strong></div>
              <div class="stat-row"><span class="text-2">Suporte</span>
                <a href="mailto:suporte@cmvpro.app">suporte@cmvpro.app</a></div>
            </div>
          </div>
        </div>

        <div class="card anim-in">
          <div class="card__head"><h2>${icon('help', 18)} Conceitos essenciais</h2></div>
          <div class="card__body" style="display:flex;flex-direction:column;gap:var(--sp-2)">
            ${CONCEITOS.map(([q, a]) => `
              <details style="border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--sp-3)">
                <summary style="cursor:pointer;font-weight:550">${q}</summary>
                <p class="text-2" style="margin-top:var(--sp-2)">${a}</p>
              </details>`).join('')}
          </div>
        </div>
      </div>
    `;

    container.querySelectorAll('[data-rota]').forEach((b) =>
      b.addEventListener('click', () => navigate(b.dataset.rota)));
  },

  destroy() {},
};
