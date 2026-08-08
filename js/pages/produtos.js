/**
 * CMV Pro — Produtos
 * ------------------
 * Catálogo de venda com preços por canal (balcão, delivery próprio, iFood,
 * 99Food, Keeta), taxas, metas de margem e leitura imediata de custo, CMV e
 * margem calculados a partir da ficha técnica.
 */

import { db } from '../services/db.js';
import { custoPorcao, analisarCanal } from '../services/calc.js';
import { money, pct, esc, initials, parseMoney } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { upgradeSelect } from '../components/combobox.js';
import { removeWithUndo } from '../components/undo.js';
import { emptyState, tableSkeleton, pageHead, btnLoading } from '../components/ui.js';
import { bus } from '../core/events.js';
import { navigate } from '../core/router.js';

const CANAIS = ['balcao', 'delivery', 'ifood', 'app99', 'keeta'];

const state = { busca: '', categoriaId: '', ordem: 'nome' };

let offDb = null;
let menuAberto = null;

function fecharMenu() {
  menuAberto?.remove();
  menuAberto = null;
}

/* ------------------------------ formulário ------------------------------ */

async function abrirForm(prod, { categorias, settings }) {
  const isEdit = Boolean(prod?.id);
  const catProd = categorias.filter((c) => c.tipo === 'produto');
  const canais = settings?.canais ?? {};

  const precoInput = (canal) => `
    <div class="field">
      <label class="field__label">${esc(canais[canal]?.nome ?? canal)}</label>
      <div class="input-group">
        <span class="input-group__affix">R$</span>
        <input class="input" name="preco-${canal}" data-mask="money"
          value="${prod?.precos?.[canal] != null ? String(prod.precos[canal]).replace('.', ',') : ''}"
          placeholder="0,00" />
      </div>
      ${canais[canal]?.comissao ? `<span class="field__hint">Comissão do canal: ${canais[canal].comissao}%</span>` : ''}
    </div>`;

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-grid">
      <div class="field span-2">
        <label class="field__label">Nome do produto <span class="req">*</span></label>
        <input class="input" name="nome" value="${esc(prod?.nome ?? '')}" placeholder="Ex.: Burger Clássico" />
        <span class="field__error" role="alert"></span>
      </div>

      <div class="field">
        <label class="field__label">Categoria</label>
        <select class="input" name="categoriaId" data-create>
          <option value="">Sem categoria</option>
          ${catProd.map((c) => `<option value="${c.id}" ${prod?.categoriaId === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label class="field__label">Imagem (URL)</label>
        <input class="input" name="imagem" value="${esc(prod?.imagem ?? '')}" placeholder="https://…/foto.jpg" />
      </div>

      <div class="field span-2">
        <label class="field__label">Descrição</label>
        <textarea class="input" name="descricao" placeholder="Descrição que aparece no cardápio…">${esc(prod?.descricao ?? '')}</textarea>
      </div>

      <div class="span-2">
        <div class="sidebar__group" style="padding-left:0">Preços por canal</div>
        <div class="form-grid" style="margin-top:var(--sp-2)">
          ${CANAIS.map(precoInput).join('')}
          <div class="field">
            <label class="field__label">Taxa de embalagem</label>
            <div class="input-group">
              <span class="input-group__affix">R$</span>
              <input class="input" name="taxaEmbalagem" data-mask="money"
                value="${prod?.taxaEmbalagem != null ? String(prod.taxaEmbalagem).replace('.', ',') : '0'}" />
            </div>
            <span class="field__hint">Custo de caixa/copo somado a cada venda.</span>
          </div>
        </div>
      </div>

      <div class="span-2">
        <div class="sidebar__group" style="padding-left:0">Metas de margem</div>
        <div class="form-grid" style="margin-top:var(--sp-2)">
          <div class="field">
            <label class="field__label">Margem mínima (%)</label>
            <input class="input" name="margemMinima" inputmode="decimal" value="${prod?.margemMinima ?? 50}" />
          </div>
          <div class="field">
            <label class="field__label">Margem ideal (%)</label>
            <input class="input" name="margemIdeal" inputmode="decimal" value="${prod?.margemIdeal ?? 65}" />
          </div>
        </div>
      </div>
    </div>`;

  const footer = document.createElement('div');
  footer.style.display = 'contents';
  footer.innerHTML = `
    <button class="btn btn--secondary" data-cancel>Cancelar</button>
    <button class="btn btn--primary" data-save>${isEdit ? 'Salvar alterações' : 'Criar produto'}</button>`;

  const m = openModal({
    title: isEdit ? `Editar — ${prod.nome}` : 'Novo produto',
    content, footer, size: 'lg',
  });

  // Categoria vira busca com "criar «texto»" embutido
  upgradeSelect(content.querySelector('[name="categoriaId"]'), {
    onCreate: async (nome) => {
      const c = await db.insert('categorias', { nome, tipo: 'produto', cor: '#2563EB' });
      toast.success('Categoria criada', nome);
      return { id: c.id, nome };
    },
  });

  footer.querySelector('[data-cancel]').addEventListener('click', () => m.close());
  footer.querySelector('[data-save]').addEventListener('click', async (e) => {
    const get = (n) => content.querySelector(`[name="${n}"]`);

    const nome = get('nome').value.trim();
    const fieldNome = get('nome').closest('.field');
    fieldNome.classList.toggle('has-error', !nome);
    if (!nome) {
      fieldNome.querySelector('.field__error').textContent = 'Informe o nome do produto.';
      return;
    }

    // Monta o objeto de preços apenas com canais preenchidos
    const precos = {};
    for (const canal of CANAIS) {
      const v = get(`preco-${canal}`).value.trim();
      if (v !== '') precos[canal] = parseMoney(v);
    }

    const doc = {
      nome,
      categoriaId: get('categoriaId').value || null,
      descricao: get('descricao').value.trim(),
      imagem: get('imagem').value.trim(),
      precos,
      taxaEmbalagem: parseMoney(get('taxaEmbalagem').value),
      margemMinima: parseMoney(get('margemMinima').value) || 50,
      margemIdeal: parseMoney(get('margemIdeal').value) || 65,
    };

    const restore = btnLoading(e.currentTarget);
    try {
      if (isEdit) {
        await db.update('produtos', prod.id, doc);
        toast.success('Produto atualizado', nome);
        m.close();
      } else {
        const criado = await db.insert('produtos', {
          ...doc,
          ficha: { itens: [], rendimento: 1 },
        });
        toast.success('Produto criado', nome);
        m.close();
        // Sem ficha não há CMV — oferece montar agora
        const montar = await confirmDialog({
          title: 'Montar a ficha técnica agora?',
          message: 'Sem ficha técnica o custo e o CMV do produto não são calculados.',
          confirmLabel: 'Montar ficha',
          cancelLabel: 'Depois',
        });
        if (montar) navigate(`fichas/${criado.id}`);
      }
    } catch (err) {
      restore();
      toast.error('Não foi possível salvar', err.message);
    }
  });
}

/* -------------------------------- página -------------------------------- */

export default {
  async render(container, ctx) {
    container.innerHTML = pageHead({
      title: 'Produtos',
      subtitle: 'Preços por canal, custo real e margem de cada item do cardápio.',
      actions: `<button class="btn btn--primary" data-new>${icon('plus', 17)} Novo produto</button>`,
    }) + `<div data-list>${tableSkeleton()}</div>`;

    const listEl = container.querySelector('[data-list]');
    let cache = { produtos: [], ingredientes: [], categorias: [], settings: null };

    const novo = () => abrirForm(null, cache);
    ctx.setFab?.({ label: 'Novo produto', onClick: () => novo() });
    container.querySelector('[data-new]').addEventListener('click', novo);

    function aplicarFiltros(itens) {
      let out = [...itens];
      const q = state.busca.trim().toLowerCase();
      if (q) out = out.filter((p) => p.nome.toLowerCase().includes(q));
      if (state.categoriaId) out = out.filter((p) => p.categoriaId === state.categoriaId);

      const sorters = {
        nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
        margem: (a, b) => (b._margem ?? -999) - (a._margem ?? -999),
        cmv: (a, b) => (b._cmv ?? 0) - (a._cmv ?? 0),
      };
      return out.sort(sorters[state.ordem] ?? sorters.nome);
    }

    const paint = async () => {
      const [produtos, ingredientes, categorias, settings] = await Promise.all([
        db.all('produtos'), db.all('ingredientes'), db.all('categorias'), db.getSettings(),
      ]);
      cache = { produtos, ingredientes, categorias, settings };

      const ingMap = new Map(ingredientes.map((i) => [i.id, i]));
      const metaCmv = settings?.metas?.cmvMax ?? 35;
      const catProd = categorias.filter((c) => c.tipo === 'produto');
      const catNome = (id) => catProd.find((c) => c.id === id)?.nome ?? 'Sem categoria';

      // Pré-calcula custo/CMV/margem no balcão para exibição e ordenação
      for (const p of produtos) {
        const temFicha = Boolean(p.ficha?.itens?.length);
        p._custo = temFicha ? custoPorcao(p, ingMap) : null;
        if (temFicha && p.precos?.balcao) {
          const a = analisarCanal(p._custo, p.precos.balcao, { embalagem: p.taxaEmbalagem ?? 0 });
          p._cmv = a.cmvPct;
          p._margem = a.margemPct;
          p._lucro = a.lucro;
        } else {
          p._cmv = null; p._margem = null; p._lucro = null;
        }
      }

      if (!produtos.length) {
        listEl.innerHTML = emptyState({
          iconName: 'package',
          title: 'Nenhum produto ainda',
          text: 'Cadastre os itens do seu cardápio para acompanhar custo, CMV e margem de cada um.',
          actionLabel: 'Criar primeiro produto',
          actionId: 'first-prod',
        });
        listEl.querySelector('#first-prod')?.addEventListener('click', novo);
        return;
      }

      const itens = aplicarFiltros(produtos);

      const cmvBadge = (p) => {
        if (p._cmv == null) return '<span class="text-3">—</span>';
        const cls = p._lucro <= 0 ? 'badge--danger' : p._cmv > metaCmv ? 'badge--warning' : 'badge--success';
        return `<span class="badge ${cls}">${pct(p._cmv)}</span>`;
      };

      listEl.innerHTML = `
        <div class="toolbar anim-in">
          <label class="toolbar__search">
            ${icon('search', 17)}
            <input type="search" placeholder="Buscar produto…" value="${esc(state.busca)}"
              data-busca aria-label="Buscar produtos" />
          </label>
          <div class="toolbar__filters">
            <button class="chip ${!state.categoriaId ? 'is-active' : ''}" data-cat="">Todas</button>
            ${catProd.map((c) => `
              <button class="chip ${state.categoriaId === c.id ? 'is-active' : ''}" data-cat="${c.id}">
                ${esc(c.nome)}
              </button>`).join('')}
            <select class="input" data-ordem style="width:auto;height:32px;font-size:var(--text-sm)">
              <option value="nome" ${state.ordem === 'nome' ? 'selected' : ''}>Nome A–Z</option>
              <option value="margem" ${state.ordem === 'margem' ? 'selected' : ''}>Maior margem</option>
              <option value="cmv" ${state.ordem === 'cmv' ? 'selected' : ''}>Maior CMV</option>
            </select>
          </div>
        </div>

        ${itens.length ? `
        <div class="card anim-in">
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th class="cell-num">Balcão</th>
                  <th class="cell-num">Custo</th>
                  <th class="cell-num">CMV</th>
                  <th class="cell-num">Margem</th>
                  <th>Ficha técnica</th>
                  <th class="cell-actions"><span class="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                ${itens.map((p) => `
                  <tr data-id="${p.id}">
                    <td>
                      <div class="entity">
                        <div class="entity__avatar">
                          ${p.imagem ? `<img src="${esc(p.imagem)}" alt="" loading="lazy" />` : esc(initials(p.nome))}
                        </div>
                        <div style="min-width:0">
                          <div class="entity__name truncate">${esc(p.nome)}</div>
                          <div class="entity__meta truncate">${esc(catNome(p.categoriaId))}</div>
                        </div>
                      </div>
                    </td>
                    <td class="cell-num"><strong>${p.precos?.balcao ? money(p.precos.balcao) : '<span class="text-3">—</span>'}</strong></td>
                    <td class="cell-num text-2">${p._custo != null ? money(p._custo) : '<span class="text-3">—</span>'}</td>
                    <td class="cell-num">${cmvBadge(p)}</td>
                    <td class="cell-num ${p._margem != null && p._lucro <= 0 ? 'text-danger' : ''}">
                      ${p._margem != null ? pct(p._margem) : '<span class="text-3">—</span>'}
                    </td>
                    <td>
                      ${p.ficha?.itens?.length
                        ? `<a href="#/fichas/${p.id}" class="badge badge--primary" style="text-decoration:none">${p.ficha.itens.length} ingrediente${p.ficha.itens.length > 1 ? 's' : ''}</a>`
                        : `<a href="#/fichas/${p.id}" class="badge badge--warning" style="text-decoration:none">${icon('alert-triangle', 12)} Sem ficha</a>`}
                    </td>
                    <td class="cell-actions">
                      <button class="icon-btn" data-menu-btn aria-label="Ações de ${esc(p.nome)}">
                        ${icon('more-v', 18)}
                      </button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <p class="text-3" style="margin-top:var(--sp-3);font-size:var(--text-sm)">
          ${itens.length} de ${produtos.length} produto(s) · CMV e margem calculados no preço de balcão
        </p>`
        : emptyState({
            iconName: 'search',
            title: 'Nada encontrado',
            text: 'Tente outro termo de busca ou remova os filtros.',
          })}
      `;

      /* ------------------------- eventos ------------------------- */
      const busca = listEl.querySelector('[data-busca]');
      busca?.addEventListener('input', () => {
        state.busca = busca.value;
        clearTimeout(busca._t);
        busca._t = setTimeout(() => {
          const pos = busca.selectionStart;
          paint().then(() => {
            const nb = listEl.querySelector('[data-busca]');
            nb?.focus();
            nb?.setSelectionRange(pos, pos);
          });
        }, 140);
      });

      listEl.querySelectorAll('[data-cat]').forEach((c) =>
        c.addEventListener('click', () => { state.categoriaId = c.dataset.cat; paint(); }));

      listEl.querySelector('[data-ordem]')?.addEventListener('change', (e) => {
        state.ordem = e.target.value; paint();
      });

      listEl.querySelectorAll('[data-menu-btn]').forEach((btn) =>
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          fecharMenu();
          const p = cache.produtos.find((x) => x.id === btn.closest('tr').dataset.id);

          const menu = document.createElement('div');
          menu.className = 'menu';
          menu.innerHTML = `
            <button class="menu__item" data-a="editar">${icon('edit', 16)} Editar produto</button>
            <button class="menu__item" data-a="ficha">${icon('clipboard', 16)} Ficha técnica</button>
            <button class="menu__item" data-a="duplicar">${icon('copy', 16)} Duplicar</button>
            <div class="menu__sep"></div>
            <button class="menu__item menu__item--danger" data-a="excluir">${icon('trash', 16)} Excluir</button>`;
          document.body.appendChild(menu);
          const r = btn.getBoundingClientRect();
          menu.style.top = `${Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8)}px`;
          menu.style.left = `${Math.max(8, r.right - menu.offsetWidth)}px`;
          menuAberto = menu;

          menu.addEventListener('click', async (ev) => {
            const acao = ev.target.closest('[data-a]')?.dataset.a;
            fecharMenu();
            if (acao === 'editar') abrirForm(p, cache);
            if (acao === 'ficha') navigate(`fichas/${p.id}`);
            if (acao === 'duplicar') {
              const { id, createdAt, updatedAt, _custo, _cmv, _margem, _lucro, ...rest } = p;
              await db.insert('produtos', { ...rest, nome: `${p.nome} (cópia)` });
              toast.success('Produto duplicado', `${p.nome} (cópia)`);
            }
            if (acao === 'excluir') {
              // desanexa campos calculados antes de guardar para o "desfazer"
              const { _custo, _cmv, _margem, _lucro, ...limpo } = p;
              await removeWithUndo('produtos', limpo, { nome: p.nome });
            }
          });
        }));
    };

    document.addEventListener('click', fecharMenu);
    document.addEventListener('scroll', fecharMenu, true);

    await paint();
    offDb = bus.on('db:changed', ({ collection }) => {
      if (['produtos', 'ingredientes', 'categorias', 'settings', '*'].includes(collection)) paint();
    });
  },

  destroy() {
    offDb?.(); offDb = null;
    fecharMenu();
    document.removeEventListener('click', fecharMenu);
    document.removeEventListener('scroll', fecharMenu, true);
  },
};
