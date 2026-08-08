/**
 * CMV Pro — Estoque
 * -----------------
 * Controle de saldo por ingrediente: entradas, saídas, perdas e inventário
 * (ajuste), com lote/validade, valor imobilizado, últimos movimentos e
 * sugestão de compra que vira pedido com um clique.
 */

import { db } from '../services/db.js';
import {
  registrarMovimento, valorEstoque, sugestaoCompra, gerarCompras,
} from '../services/estoque.js';
import { money, num, esc, initials, parseMoney, dateRelative } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { emptyState, tableSkeleton, pageHead, kpiCard, btnLoading } from '../components/ui.js';
import { bus } from '../core/events.js';
import { navigate } from '../core/router.js';

const state = { busca: '', soAbaixo: false };

let offDb = null;

const TIPOS = {
  entrada: { nome: 'Entrada', icone: 'arrow-down', cls: 'success' },
  saida: { nome: 'Saída', icone: 'arrow-up', cls: 'info' },
  perda: { nome: 'Perda', icone: 'alert-triangle', cls: 'danger' },
  ajuste: { nome: 'Inventário', icone: 'check-circle', cls: 'neutral' },
};

/* ------------------------- modal de movimento --------------------------- */

function abrirMovimento(ing, tipoInicial = 'entrada') {
  const content = document.createElement('div');
  content.innerHTML = `
    <p class="text-2" style="margin-bottom:var(--sp-4)">
      ${esc(ing.nome)} — saldo atual:
      <strong>${ing.estoque != null ? `${num(ing.estoque)} ${ing.unidade}` : 'sem controle'}</strong>
    </p>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">Tipo de movimento</label>
        <select class="input" name="tipo">
          ${Object.entries(TIPOS).map(([id, t]) =>
            `<option value="${id}" ${id === tipoInicial ? 'selected' : ''}>${t.nome}</option>`).join('')}
        </select>
        <span class="field__hint" data-hint-tipo></span>
      </div>
      <div class="field">
        <label class="field__label">Quantidade <span class="req">*</span></label>
        <div class="input-group">
          <input class="input" name="qtd" inputmode="decimal" placeholder="0"
            style="border-radius:var(--radius-md) 0 0 var(--radius-md)" />
          <span class="input-group__affix" style="border-left:1px solid var(--border-strong);border-right:none;border-radius:0 var(--radius-md) var(--radius-md) 0">${ing.unidade}</span>
        </div>
        <span class="field__error" role="alert"></span>
      </div>
      <div class="field" data-f-custo>
        <label class="field__label">Custo total (opcional)</label>
        <div class="input-group">
          <span class="input-group__affix">R$</span>
          <input class="input" name="custo" data-mask="money" placeholder="0,00" />
        </div>
      </div>
      <div class="field">
        <label class="field__label">Lote (opcional)</label>
        <input class="input" name="lote" placeholder="Ex.: L-2026-07" />
      </div>
      <div class="field">
        <label class="field__label">Validade (opcional)</label>
        <input class="input" name="validade" type="date" />
      </div>
      <div class="field span-2">
        <label class="field__label">Observações</label>
        <input class="input" name="observacoes" placeholder="Motivo, nota fiscal, responsável…" />
      </div>
    </div>`;

  const footer = document.createElement('div');
  footer.style.display = 'contents';
  footer.innerHTML = `
    <button class="btn btn--secondary" data-cancel>Cancelar</button>
    <button class="btn btn--primary" data-save>Registrar</button>`;

  const m = openModal({ title: `Movimentar — ${ing.nome}`, content, footer, size: 'lg' });

  const tipoSel = content.querySelector('[name="tipo"]');
  const hint = content.querySelector('[data-hint-tipo]');
  const custoField = content.querySelector('[data-f-custo]');
  const atualizaHints = () => {
    const dicas = {
      entrada: 'Soma ao saldo (compra, devolução…).',
      saida: 'Subtrai do saldo (consumo, transferência…).',
      perda: 'Subtrai do saldo e conta como desperdício.',
      ajuste: 'Inventário: o saldo passa a ser exatamente a quantidade informada.',
    };
    hint.textContent = dicas[tipoSel.value];
    custoField.style.display = tipoSel.value === 'entrada' ? '' : 'none';
  };
  tipoSel.addEventListener('change', atualizaHints);
  atualizaHints();

  footer.querySelector('[data-cancel]').addEventListener('click', () => m.close());
  footer.querySelector('[data-save]').addEventListener('click', async (e) => {
    const get = (n) => content.querySelector(`[name="${n}"]`);
    const qtd = parseMoney(get('qtd').value);
    const fieldQtd = get('qtd').closest('.field');
    const okQtd = tipoSel.value === 'ajuste' ? qtd >= 0 && get('qtd').value !== '' : qtd > 0;
    fieldQtd.classList.toggle('has-error', !okQtd);
    if (!okQtd) {
      fieldQtd.querySelector('.field__error').textContent = 'Informe a quantidade.';
      return;
    }

    const restore = btnLoading(e.currentTarget, 'Registrando…');
    try {
      await registrarMovimento({
        ingredienteId: ing.id,
        tipo: tipoSel.value,
        qtd,
        custo: get('custo').value ? parseMoney(get('custo').value) : null,
        lote: get('lote').value.trim(),
        validade: get('validade').value || null,
        observacoes: get('observacoes').value.trim(),
      });
      m.close();
      toast.success('Movimento registrado', `${TIPOS[tipoSel.value].nome} de ${num(qtd)} ${ing.unidade} — ${ing.nome}`);
    } catch (err) {
      restore();
      toast.error('Não foi possível registrar', err.message);
    }
  });
}

/* -------------------------------- página -------------------------------- */

export default {
  async render(container, ctx) {
    container.innerHTML = pageHead({
      title: 'Estoque',
      subtitle: 'Saldos, movimentações, inventário e o que precisa ser comprado.',
    }) + `<div data-body>${tableSkeleton()}</div>`;

    const bodyEl = container.querySelector('[data-body]');

    const paint = async () => {
      const [ingredientes, movimentos, fornecedores] = await Promise.all([
        db.all('ingredientes'), db.all('movimentos'), db.all('fornecedores'),
      ]);

      if (!ingredientes.length) {
        bodyEl.innerHTML = emptyState({
          iconName: 'boxes',
          title: 'Sem ingredientes para controlar',
          text: 'Cadastre seus insumos primeiro — o estoque acompanha cada um deles.',
          actionLabel: 'Ir para Ingredientes',
          actionId: 'go-ing',
        });
        bodyEl.querySelector('#go-ing')?.addEventListener('click', () => navigate('ingredientes'));
        return;
      }

      const controlados = ingredientes.filter((i) => i.estoque != null);
      const abaixo = controlados.filter((i) => i.estoqueMin != null && i.estoque <= i.estoqueMin);
      const valorTotal = controlados.reduce((s, i) => s + valorEstoque(i), 0);
      const sugestoes = sugestaoCompra(ingredientes);
      const fornNome = (id) => fornecedores.find((f) => f.id === id)?.nome ?? 'Sem fornecedor';

      let itens = [...ingredientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      const q = state.busca.trim().toLowerCase();
      if (q) itens = itens.filter((i) => i.nome.toLowerCase().includes(q));
      if (state.soAbaixo) itens = itens.filter((i) => i.estoqueMin != null && i.estoque != null && i.estoque <= i.estoqueMin);

      const recentes = [...movimentos]
        .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
        .slice(0, 8);
      const ingNome = (id) => ingredientes.find((i) => i.id === id)?.nome ?? '(excluído)';
      const ingUn = (id) => ingredientes.find((i) => i.id === id)?.unidade ?? '';

      bodyEl.innerHTML = `
        <section class="grid grid--kpi" style="margin-bottom:var(--sp-4)">
          ${kpiCard({ label: 'Valor em estoque', value: money(valorTotal), hint: `${controlados.length} item(ns) controlado(s)` })}
          ${kpiCard({ label: 'Abaixo do mínimo', value: String(abaixo.length), hint: abaixo.length ? 'reposição necessária' : 'tudo abastecido' })}
          ${kpiCard({ label: 'Sem controle', value: String(ingredientes.length - controlados.length), hint: 'itens sem saldo informado' })}
        </section>

        ${sugestoes.length ? `
        <div class="card anim-in" style="margin-bottom:var(--sp-4)">
          <div class="card__head">
            <h2>${icon('cart', 18)} Sugestão de compra</h2>
            <button class="btn btn--sm btn--primary" data-gerar-compra>
              ${icon('plus', 15)} Gerar pedido${sugestoes.length > 1 ? 's' : ''} (${money(sugestoes.reduce((s, g) => s + g.total, 0))})
            </button>
          </div>
          <div class="card__body card__body--flush">
            ${sugestoes.map((g) => `
              <div class="alert-item">
                <div class="alert-item__icon alert-item__icon--warning">${icon('cart', 16)}</div>
                <div style="flex:1;min-width:0">
                  <div class="alert-item__title">${esc(fornNome(g.fornecedorId))} · ${money(g.total)}</div>
                  <div class="alert-item__desc">
                    ${g.itens.map((i) => `${esc(i.ingrediente.nome)} (${i.embalagens} emb.)`).join(' · ')}
                  </div>
                </div>
              </div>`).join('')}
          </div>
        </div>` : ''}

        <div class="toolbar anim-in">
          <label class="toolbar__search">
            ${icon('search', 17)}
            <input type="search" placeholder="Buscar insumo…" value="${esc(state.busca)}" data-busca
              aria-label="Buscar no estoque" />
          </label>
          <div class="toolbar__filters">
            <button class="chip ${state.soAbaixo ? 'is-active' : ''}" data-filtro-abaixo>
              ${icon('alert-triangle', 14)} Abaixo do mínimo (${abaixo.length})
            </button>
          </div>
        </div>

        <div class="grid grid--2" style="align-items:start">
          <div class="card anim-in">
            <div class="table-wrap">
              <table class="table" style="min-width:480px">
                <thead>
                  <tr>
                    <th>Insumo</th>
                    <th class="cell-num">Saldo</th>
                    <th class="cell-num">Mínimo</th>
                    <th class="cell-num">Valor</th>
                    <th class="cell-actions"><span class="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  ${itens.map((i) => {
                    const baixo = i.estoqueMin != null && i.estoque != null && i.estoque <= i.estoqueMin;
                    return `
                    <tr data-id="${i.id}">
                      <td>
                        <div class="entity">
                          <div class="entity__avatar">${esc(initials(i.nome))}</div>
                          <span class="entity__name truncate">${esc(i.nome)}</span>
                        </div>
                      </td>
                      <td class="cell-num">
                        ${i.estoque == null ? '<span class="text-3">—</span>' : `
                          <span class="badge ${baixo ? 'badge--danger' : 'badge--neutral'}">
                            ${num(i.estoque)} ${i.unidade}
                          </span>`}
                      </td>
                      <td class="cell-num text-2">${i.estoqueMin != null ? `${num(i.estoqueMin)} ${i.unidade}` : '—'}</td>
                      <td class="cell-num text-2">${money(valorEstoque(i))}</td>
                      <td class="cell-actions">
                        <button class="icon-btn" data-mov="entrada" title="Entrada">${icon('arrow-down', 16)}</button>
                        <button class="icon-btn" data-mov="saida" title="Saída / perda">${icon('arrow-up', 16)}</button>
                        <button class="icon-btn" data-mov="ajuste" title="Inventário (ajuste)">${icon('check-circle', 16)}</button>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="card anim-in">
            <div class="card__head"><h2>Últimos movimentos</h2></div>
            <div class="card__body card__body--flush">
              ${recentes.length ? recentes.map((mv) => {
                const t = TIPOS[mv.tipo] ?? TIPOS.saida;
                return `
                  <div class="alert-item">
                    <div class="alert-item__icon alert-item__icon--${t.cls === 'success' ? 'info' : t.cls === 'danger' ? 'danger' : 'info'}">
                      ${icon(t.icone, 15)}
                    </div>
                    <div style="flex:1;min-width:0">
                      <div class="alert-item__title">${t.nome} · ${num(mv.qtd)} ${esc(ingUn(mv.ingredienteId))} — ${esc(ingNome(mv.ingredienteId))}</div>
                      <div class="alert-item__desc">
                        ${dateRelative(mv.data)}${mv.lote ? ` · lote ${esc(mv.lote)}` : ''}${mv.validade ? ` · val. ${new Date(mv.validade).toLocaleDateString('pt-BR')}` : ''}${mv.observacoes ? ` · ${esc(mv.observacoes)}` : ''}
                      </div>
                    </div>
                  </div>`;
              }).join('')
              : `<div class="empty-state" style="padding:var(--sp-8)">
                   <p class="text-2">Nenhum movimento registrado ainda.</p>
                 </div>`}
            </div>
          </div>
        </div>
      `;

      /* ------------------------- eventos ------------------------- */
      const busca = bodyEl.querySelector('[data-busca]');
      busca?.addEventListener('input', () => {
        state.busca = busca.value;
        clearTimeout(busca._t);
        busca._t = setTimeout(() => {
          const pos = busca.selectionStart;
          paint().then(() => {
            const nb = bodyEl.querySelector('[data-busca]');
            nb?.focus(); nb?.setSelectionRange(pos, pos);
          });
        }, 140);
      });

      bodyEl.querySelector('[data-filtro-abaixo]')?.addEventListener('click', () => {
        state.soAbaixo = !state.soAbaixo;
        paint();
      });

      bodyEl.querySelectorAll('[data-mov]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const ing = ingredientes.find((x) => x.id === btn.closest('tr').dataset.id);
          abrirMovimento(ing, btn.dataset.mov);
        }));

      bodyEl.querySelector('[data-gerar-compra]')?.addEventListener('click', async (e) => {
        const restore = btnLoading(e.currentTarget, 'Gerando…');
        try {
          const criadas = await gerarCompras(sugestoes);
          toast.success(
            `${criadas.length} pedido(s) de compra criado(s)`,
            'Revise e envie na página Compras.'
          );
          navigate('compras');
        } catch (err) {
          restore();
          toast.error('Não foi possível gerar', err.message);
        }
      });
    };

    await paint();
    offDb = bus.on('db:changed', ({ collection }) => {
      if (['ingredientes', 'movimentos', 'compras', '*'].includes(collection)) paint();
    });
  },

  destroy() {
    offDb?.(); offDb = null;
  },
};
