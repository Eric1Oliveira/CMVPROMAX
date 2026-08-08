/**
 * CMV Pro — Compras
 * -----------------
 * Pedidos de compra por fornecedor: rascunho → enviado → recebido.
 * Ao RECEBER, o estoque ganha as entradas e o preço dos ingredientes é
 * atualizado quando o fornecedor cobrou diferente (alimenta histórico
 * e os alertas de "fornecedor alterou preço").
 */

import { db } from '../services/db.js';
import { receberCompra } from '../services/estoque.js';
import { money, num, esc, parseMoney, dateRelative } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { emptyState, tableSkeleton, pageHead, kpiCard, btnLoading } from '../components/ui.js';
import { bus } from '../core/events.js';
import { navigate } from '../core/router.js';

let offDb = null;
let menuAberto = null;

function fecharMenu() {
  menuAberto?.remove();
  menuAberto = null;
}

const STATUS = {
  rascunho: { nome: 'Rascunho', badge: 'neutral' },
  enviado: { nome: 'Enviado', badge: 'primary' },
  recebido: { nome: 'Recebido', badge: 'success' },
  cancelado: { nome: 'Cancelado', badge: 'danger' },
};

/* ------------------------- editor de pedido ----------------------------- */

async function abrirPedido(compra, { fornecedores, ingredientes }) {
  const isEdit = Boolean(compra?.id);
  /** Itens editáveis: { ingredienteId, qtdEmbalagens, precoUnit } */
  const itens = (compra?.itens ?? []).map((i) => ({ ...i }));

  const content = document.createElement('div');

  const linhaHtml = (item, idx) => {
    const ing = ingredientes.find((i) => i.id === item.ingredienteId);
    return `
      <div class="ficha-row" data-idx="${idx}" style="grid-template-columns:minmax(130px,2fr) 90px 110px 90px 32px">
        <select class="input" data-k="ingredienteId" aria-label="Ingrediente">
          <option value="">Escolher…</option>
          ${ingredientes.map((i) =>
            `<option value="${i.id}" ${item.ingredienteId === i.id ? 'selected' : ''}>${esc(i.nome)}</option>`).join('')}
        </select>
        <input class="input" data-k="qtdEmbalagens" inputmode="decimal" value="${item.qtdEmbalagens ?? ''}"
          placeholder="Emb." title="Quantidade de embalagens${ing ? ` (${num(ing.qtdEmbalagem)} ${ing.unidade} cada)` : ''}" />
        <input class="input" data-k="precoUnit" inputmode="decimal"
          value="${item.precoUnit != null ? String(item.precoUnit).replace('.', ',') : ''}"
          placeholder="R$/emb." title="Preço por embalagem" />
        <span class="ficha-row__custo tnum" data-sub></span>
        <button class="icon-btn" data-remove aria-label="Remover item">${icon('x', 16)}</button>
      </div>`;
  };

  function totalPedido() {
    return itens.reduce((s, i) => s + (i.qtdEmbalagens || 0) * (i.precoUnit || 0), 0);
  }

  content.innerHTML = `
    <div class="field" style="margin-bottom:var(--sp-4)">
      <label class="field__label">Fornecedor</label>
      <select class="input" name="fornecedorId">
        <option value="">Sem fornecedor</option>
        ${fornecedores.map((f) =>
          `<option value="${f.id}" ${compra?.fornecedorId === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}
      </select>
    </div>
    <div class="sidebar__group" style="padding-left:0">Itens do pedido</div>
    <div data-itens style="margin:var(--sp-2) 0 var(--sp-3)"></div>
    <button class="btn btn--sm btn--secondary" data-add>${icon('plus', 15)} Adicionar item</button>
    <div class="stat-row" style="margin-top:var(--sp-4);border-top:1px solid var(--border);padding-top:var(--sp-3)">
      <strong>Total do pedido</strong><strong class="tnum" data-total></strong>
    </div>`;

  const itensEl = content.querySelector('[data-itens]');
  const totalEl = content.querySelector('[data-total]');

  function paintItens() {
    itensEl.innerHTML = itens.length
      ? itens.map(linhaHtml).join('')
      : '<p class="text-2" style="padding:var(--sp-2) 0">Nenhum item — adicione o primeiro.</p>';
    totalEl.textContent = money(totalPedido());

    itensEl.querySelectorAll('.ficha-row[data-idx]').forEach((row) => {
      const idx = Number(row.dataset.idx);
      const paintSub = () => {
        const it = itens[idx];
        row.querySelector('[data-sub]').textContent =
          money((it.qtdEmbalagens || 0) * (it.precoUnit || 0));
        totalEl.textContent = money(totalPedido());
      };
      row.querySelectorAll('[data-k]').forEach((input) =>
        input.addEventListener('input', () => {
          const k = input.dataset.k;
          itens[idx][k] = k === 'ingredienteId' ? input.value : parseMoney(input.value);
          // ao escolher o ingrediente, sugere o preço de embalagem atual
          if (k === 'ingredienteId') {
            const ing = ingredientes.find((i) => i.id === input.value);
            if (ing && !itens[idx].precoUnit) {
              itens[idx].precoUnit = ing.preco ?? 0;
              row.querySelector('[data-k="precoUnit"]').value = String(ing.preco ?? 0).replace('.', ',');
            }
          }
          paintSub();
        }));
      row.querySelector('[data-remove]').addEventListener('click', () => {
        itens.splice(idx, 1);
        paintItens();
      });
      paintSub();
    });
  }

  content.querySelector('[data-add]').addEventListener('click', () => {
    itens.push({ ingredienteId: '', qtdEmbalagens: 1, precoUnit: 0 });
    paintItens();
  });

  const footer = document.createElement('div');
  footer.style.display = 'contents';
  footer.innerHTML = `
    <button class="btn btn--secondary" data-cancel>Cancelar</button>
    <button class="btn btn--primary" data-save>${isEdit ? 'Salvar pedido' : 'Criar pedido'}</button>`;

  const m = openModal({
    title: isEdit ? 'Editar pedido de compra' : 'Novo pedido de compra',
    content, footer, size: 'lg',
  });
  paintItens();

  footer.querySelector('[data-cancel]').addEventListener('click', () => m.close());
  footer.querySelector('[data-save]').addEventListener('click', async (e) => {
    const validos = itens.filter((i) => i.ingredienteId && i.qtdEmbalagens > 0);
    if (!validos.length) {
      toast.warning('Pedido vazio', 'Adicione ao menos um item com quantidade.');
      return;
    }
    const doc = {
      fornecedorId: content.querySelector('[name="fornecedorId"]').value || null,
      itens: validos,
      total: validos.reduce((s, i) => s + i.qtdEmbalagens * (i.precoUnit || 0), 0),
    };
    const restore = btnLoading(e.currentTarget);
    try {
      if (isEdit) {
        await db.update('compras', compra.id, doc);
        toast.success('Pedido atualizado');
      } else {
        await db.insert('compras', { ...doc, status: 'rascunho', data: new Date().toISOString() });
        toast.success('Pedido criado', 'Salvo como rascunho.');
      }
      m.close();
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
      title: 'Compras',
      subtitle: 'Pedidos por fornecedor — receber dá entrada no estoque e atualiza preços.',
      actions: `<button class="btn btn--primary" data-new>${icon('plus', 17)} Novo pedido</button>`,
    }) + `<div data-body>${tableSkeleton()}</div>`;

    const bodyEl = container.querySelector('[data-body]');
    let cache = { compras: [], fornecedores: [], ingredientes: [] };

    const novo = () => abrirPedido(null, cache);
    ctx.setFab?.({ label: 'Novo pedido de compra', onClick: () => novo() });
    container.querySelector('[data-new]').addEventListener('click', novo);

    const paint = async () => {
      const [compras, fornecedores, ingredientes] = await Promise.all([
        db.all('compras'), db.all('fornecedores'), db.all('ingredientes'),
      ]);
      cache = { compras, fornecedores, ingredientes };

      const fornNome = (id) => fornecedores.find((f) => f.id === id)?.nome ?? 'Sem fornecedor';
      const corte30 = Date.now() - 30 * 86_400_000;
      const recebidas30 = compras.filter(
        (c) => c.status === 'recebido' && new Date(c.data).getTime() >= corte30);

      if (!compras.length) {
        bodyEl.innerHTML = emptyState({
          iconName: 'cart',
          title: 'Nenhum pedido de compra',
          text: 'Crie um pedido manualmente ou gere a partir da sugestão de compra do Estoque.',
          actionLabel: 'Criar pedido',
          actionId: 'first-compra',
        }) + `
          <div style="text-align:center;margin-top:calc(var(--sp-6) * -1);padding-bottom:var(--sp-8)">
            <button class="btn btn--ghost" id="go-estoque">Ver sugestão de compra no Estoque</button>
          </div>`;
        bodyEl.querySelector('#first-compra')?.addEventListener('click', novo);
        bodyEl.querySelector('#go-estoque')?.addEventListener('click', () => navigate('estoque'));
        return;
      }

      const linhas = [...compras].sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));

      bodyEl.innerHTML = `
        <section class="grid grid--kpi" style="margin-bottom:var(--sp-4)">
          ${kpiCard({
            label: 'Pedidos abertos',
            value: String(compras.filter((c) => ['rascunho', 'enviado'].includes(c.status)).length),
            hint: 'rascunhos + enviados',
          })}
          ${kpiCard({
            label: 'Recebidos (30 dias)',
            value: String(recebidas30.length),
            hint: 'pedidos concluídos',
          })}
          ${kpiCard({
            label: 'Gasto em compras (30 dias)',
            value: money(recebidas30.reduce((s, c) => s + (c.total ?? 0), 0)),
            hint: 'somatório dos recebidos',
          })}
        </section>

        <div class="card anim-in">
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Status</th>
                  <th class="cell-num">Itens</th>
                  <th class="cell-num">Total</th>
                  <th>Data</th>
                  <th class="cell-actions"><span class="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                ${linhas.map((c) => `
                  <tr data-id="${c.id}">
                    <td><span class="entity__name">${esc(fornNome(c.fornecedorId))}</span></td>
                    <td><span class="badge badge--${STATUS[c.status]?.badge ?? 'neutral'}">${STATUS[c.status]?.nome ?? c.status}</span></td>
                    <td class="cell-num">${c.itens?.length ?? 0}</td>
                    <td class="cell-num"><strong>${money(c.total ?? 0)}</strong></td>
                    <td class="text-2">${dateRelative(c.data)}</td>
                    <td class="cell-actions">
                      <button class="icon-btn" data-menu-btn aria-label="Ações do pedido">${icon('more-v', 18)}</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      bodyEl.querySelectorAll('[data-menu-btn]').forEach((btn) =>
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          fecharMenu();
          const c = cache.compras.find((x) => x.id === btn.closest('tr').dataset.id);
          const aberto = ['rascunho', 'enviado'].includes(c.status);

          const menu = document.createElement('div');
          menu.className = 'menu';
          menu.innerHTML = `
            ${c.status === 'rascunho' ? `<button class="menu__item" data-a="editar">${icon('edit', 16)} Editar</button>` : ''}
            ${c.status === 'rascunho' ? `<button class="menu__item" data-a="enviar">${icon('arrow-up', 16)} Marcar como enviado</button>` : ''}
            ${aberto ? `<button class="menu__item" data-a="receber">${icon('check-circle', 16)} Receber (dar entrada)</button>` : ''}
            ${aberto ? `<button class="menu__item" data-a="cancelar">${icon('x', 16)} Cancelar pedido</button>` : ''}
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
            if (acao === 'editar') abrirPedido(c, cache);
            if (acao === 'enviar') {
              await db.update('compras', c.id, { status: 'enviado' });
              toast.success('Pedido enviado', fornNome(c.fornecedorId));
            }
            if (acao === 'receber') {
              const ok = await confirmDialog({
                title: `Receber pedido de ${fornNome(c.fornecedorId)}?`,
                message: `${c.itens?.length ?? 0} item(ns) darão entrada no estoque e os preços dos ingredientes serão atualizados se o fornecedor cobrou diferente.`,
                confirmLabel: 'Receber pedido',
              });
              if (!ok) return;
              try {
                const res = await receberCompra(c);
                toast.success(
                  'Pedido recebido',
                  `${res.entradas} entrada(s) no estoque · ${res.precosAtualizados} preço(s) atualizado(s).`
                );
              } catch (err) {
                toast.error('Não foi possível receber', err.message);
              }
            }
            if (acao === 'cancelar') {
              await db.update('compras', c.id, { status: 'cancelado' });
              toast.info('Pedido cancelado');
            }
            if (acao === 'excluir') {
              const ok = await confirmDialog({
                title: 'Excluir este pedido?',
                message: 'O histórico do pedido será perdido. Movimentos de estoque já recebidos não são desfeitos.',
                confirmLabel: 'Excluir',
                danger: true,
              });
              if (ok) {
                await db.remove('compras', c.id);
                toast.success('Pedido excluído');
              }
            }
          });
        }));
    };

    document.addEventListener('click', fecharMenu);
    document.addEventListener('scroll', fecharMenu, true);

    await paint();
    offDb = bus.on('db:changed', ({ collection }) => {
      if (['compras', 'ingredientes', 'fornecedores', 'movimentos', '*'].includes(collection)) paint();
    });
  },

  destroy() {
    offDb?.(); offDb = null;
    fecharMenu();
    document.removeEventListener('click', fecharMenu);
    document.removeEventListener('scroll', fecharMenu, true);
  },
};
