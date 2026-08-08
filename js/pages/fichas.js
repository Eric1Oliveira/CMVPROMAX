/**
 * CMV Pro — Fichas Técnicas
 * -------------------------
 * Duas visões no mesmo módulo:
 *   #/fichas            → lista de produtos com o status/custo de cada ficha
 *   #/fichas/<produtoId> → EDITOR: ingredientes com quantidade/unidade/perda,
 *                          rendimento, peso final, modo de preparo e um painel
 *                          de custo/CMV/margem recalculado A CADA tecla.
 * Extras: versões da ficha (salvar snapshot + restaurar) e duplicar a ficha
 * de outro produto.
 */

import { db } from '../services/db.js';
import { custoItem, custoPorcao, analisarCanal, precosSugeridos } from '../services/calc.js';
import { money, pct, esc, num, dateRelative, UNIDADES, parseMoney } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { upgradeSelects } from '../components/combobox.js';
import { emptyState, tableSkeleton, pageHead, btnLoading } from '../components/ui.js';
import { bus } from '../core/events.js';
import { navigate } from '../core/router.js';

let offDb = null;

/* ========================================================================
   LISTA (#/fichas)
   ===================================================================== */

async function renderLista(container, ctx) {
  container.innerHTML = pageHead({
    title: 'Fichas Técnicas',
    subtitle: 'A receita de cada produto com custo calculado automaticamente.',
  }) + `<div data-list>${tableSkeleton()}</div>`;

  const listEl = container.querySelector('[data-list]');

  const paint = async () => {
    const [produtos, ingredientes, settings] = await Promise.all([
      db.all('produtos'), db.all('ingredientes'), db.getSettings(),
    ]);
    const ingMap = new Map(ingredientes.map((i) => [i.id, i]));
    const metaCmv = settings?.metas?.cmvMax ?? 35;

    if (!produtos.length) {
      listEl.innerHTML = emptyState({
        iconName: 'clipboard',
        title: 'Nenhum produto para montar ficha',
        text: 'Crie os produtos do cardápio primeiro — depois monte a receita de cada um aqui.',
        actionLabel: 'Ir para Produtos',
        actionId: 'go-prod',
      });
      listEl.querySelector('#go-prod')?.addEventListener('click', () => navigate('produtos'));
      return;
    }

    const rows = produtos
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((p) => {
        const n = p.ficha?.itens?.length ?? 0;
        const custo = n ? custoPorcao(p, ingMap) : null;
        let cmvHtml = '<span class="text-3">—</span>';
        if (custo != null && p.precos?.balcao) {
          const a = analisarCanal(custo, p.precos.balcao, { embalagem: p.taxaEmbalagem ?? 0 });
          const cls = a.lucro <= 0 ? 'badge--danger' : a.cmvPct > metaCmv ? 'badge--warning' : 'badge--success';
          cmvHtml = `<span class="badge ${cls}">${pct(a.cmvPct)}</span>`;
        }
        return `
          <tr>
            <td>
              <div class="entity">
                <div class="entity__avatar">${esc(p.nome.slice(0, 2).toUpperCase())}</div>
                <div style="min-width:0">
                  <div class="entity__name truncate">${esc(p.nome)}</div>
                  <div class="entity__meta">atualizado ${dateRelative(p.updatedAt ?? p.createdAt)}</div>
                </div>
              </div>
            </td>
            <td>${n
              ? `<span class="badge badge--primary">${n} ingrediente${n > 1 ? 's' : ''}</span>`
              : `<span class="badge badge--warning">${icon('alert-triangle', 12)} Sem ficha</span>`}</td>
            <td class="cell-num">${custo != null ? `<strong>${money(custo)}</strong>` : '<span class="text-3">—</span>'}</td>
            <td class="cell-num">${cmvHtml}</td>
            <td class="cell-actions">
              <a class="btn btn--sm btn--secondary" href="#/fichas/${p.id}">
                ${icon('edit', 15)} ${n ? 'Editar ficha' : 'Montar ficha'}
              </a>
            </td>
          </tr>`;
      }).join('');

    listEl.innerHTML = `
      <div class="card anim-in">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Produto</th><th>Ficha</th>
                <th class="cell-num">Custo/porção</th>
                <th class="cell-num">CMV balcão</th>
                <th class="cell-actions"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  };

  await paint();
  offDb = bus.on('db:changed', ({ collection }) => {
    if (['produtos', 'ingredientes', '*'].includes(collection)) paint();
  });
}

/* ========================================================================
   EDITOR (#/fichas/<produtoId>)
   ===================================================================== */

async function renderEditor(container, produtoId, ctx) {
  const [produto, ingredientes, settings] = await Promise.all([
    db.get('produtos', produtoId), db.all('ingredientes'), db.getSettings(),
  ]);

  if (!produto) {
    container.innerHTML = emptyState({
      iconName: 'alert-circle',
      title: 'Produto não encontrado',
      text: 'Ele pode ter sido excluído. Volte para a lista de fichas.',
      actionLabel: 'Voltar para Fichas',
      actionId: 'back',
    });
    container.querySelector('#back')?.addEventListener('click', () => navigate('fichas'));
    return;
  }

  const ingMap = new Map(ingredientes.map((i) => [i.id, i]));
  const canais = settings?.canais ?? {};
  const metaCmv = settings?.metas?.cmvMax ?? 35;

  /** Estado editável (clone — nada é salvo até clicar em Salvar). */
  const ficha = {
    itens: (produto.ficha?.itens ?? []).map((it) => ({ ...it })),
    rendimento: produto.ficha?.rendimento ?? 1,
    pesoFinal: produto.ficha?.pesoFinal ?? '',
    tempoMin: produto.ficha?.tempoMin ?? '',
    preparo: produto.ficha?.preparo ?? '',
  };
  let dirty = false;

  container.innerHTML = `
    <div class="page-head anim-in">
      <div class="page-head__text">
        <a href="#/fichas" class="text-2" style="font-size:var(--text-sm)">← Fichas técnicas</a>
        <h1>${esc(produto.nome)}</h1>
        <p>Monte a receita — o custo é recalculado a cada alteração.</p>
      </div>
      <div class="page-head__actions">
        <button class="btn btn--ghost" data-versoes>${icon('clock', 16)} Versões</button>
        <button class="btn btn--secondary" data-duplicar>${icon('copy', 16)} Copiar de outro produto</button>
        <button class="btn btn--primary" data-salvar>${icon('check', 16)} Salvar ficha</button>
      </div>
    </div>

    <div class="ficha-grid">
      <div style="display:flex;flex-direction:column;gap:var(--sp-4);min-width:0">
        <div class="card anim-in">
          <div class="card__head">
            <h2>Ingredientes da receita</h2>
            <button class="btn btn--sm btn--secondary" data-add>${icon('plus', 15)} Adicionar</button>
          </div>
          <div class="card__body" data-itens></div>
        </div>

        <div class="card anim-in">
          <div class="card__head"><h2>Rendimento e preparo</h2></div>
          <div class="card__body form-grid">
            <div class="field">
              <label class="field__label">Rendimento (porções)</label>
              <input class="input" data-f="rendimento" inputmode="decimal" value="${ficha.rendimento}" />
              <span class="field__hint">Quantas porções a receita rende.</span>
            </div>
            <div class="field">
              <label class="field__label">Peso final (g)</label>
              <input class="input" data-f="pesoFinal" inputmode="decimal" value="${ficha.pesoFinal}" />
            </div>
            <div class="field">
              <label class="field__label">Tempo de preparo (min)</label>
              <input class="input" data-f="tempoMin" inputmode="decimal" value="${ficha.tempoMin}" />
            </div>
            <div class="field span-2">
              <label class="field__label">Modo de preparo</label>
              <textarea class="input" data-f="preparo" rows="4"
                placeholder="Passo a passo da receita…">${esc(ficha.preparo)}</textarea>
            </div>
          </div>
        </div>
      </div>

      <aside class="ficha-summary card anim-in" data-summary aria-live="polite"></aside>
    </div>
  `;

  const itensEl = container.querySelector('[data-itens]');
  const summaryEl = container.querySelector('[data-summary]');

  ctx.setFab?.({ label: 'Adicionar ingrediente', onClick: addItem });

  /* ------------------------- linhas de ingredientes ------------------------ */

  function rowHtml(item, idx) {
    return `
      <div class="ficha-row" data-idx="${idx}">
        <select class="input" data-k="ingredienteId" data-search aria-label="Ingrediente">
          <option value="">Escolher ingrediente…</option>
          ${ingredientes.map((i) =>
            `<option value="${i.id}" ${item.ingredienteId === i.id ? 'selected' : ''}>${esc(i.nome)}</option>`).join('')}
        </select>
        <input class="input" data-k="qtd" inputmode="decimal" value="${item.qtd ?? ''}"
          placeholder="Qtd" aria-label="Quantidade" />
        <select class="input" data-k="unidade" aria-label="Unidade">
          ${UNIDADES.map((u) =>
            `<option value="${u.id}" ${item.unidade === u.id ? 'selected' : ''}>${u.id}</option>`).join('')}
        </select>
        <div class="input-group" style="min-width:0">
          <input class="input" data-k="perda" inputmode="decimal" value="${item.perda ?? 0}"
            aria-label="Perda em porcento" title="Perda (%)" />
          <span class="input-group__affix" style="border-left:1px solid var(--border-strong);border-right:none;border-radius:0 var(--radius-md) var(--radius-md) 0">%</span>
        </div>
        <span class="ficha-row__custo tnum" data-custo></span>
        <button class="icon-btn" data-remove aria-label="Remover ingrediente">${icon('x', 16)}</button>
      </div>`;
  }

  function paintItens() {
    if (!ficha.itens.length) {
      itensEl.innerHTML = `
        <div class="empty-state" style="padding:var(--sp-6)">
          <p class="text-2">Nenhum ingrediente ainda — adicione o primeiro para ver o custo.</p>
        </div>`;
      return;
    }
    itensEl.innerHTML =
      `<div class="ficha-row ficha-row--head text-3">
         <span>Ingrediente</span><span>Qtd</span><span>Un</span><span>Perda</span><span style="text-align:right">Custo</span><span></span>
       </div>` +
      ficha.itens.map(rowHtml).join('');

    itensEl.querySelectorAll('.ficha-row[data-idx]').forEach((row) => {
      const idx = Number(row.dataset.idx);

      row.querySelectorAll('[data-k]').forEach((input) => {
        input.addEventListener('input', () => {
          const k = input.dataset.k;
          ficha.itens[idx][k] = (k === 'qtd' || k === 'perda') ? parseMoney(input.value) : input.value;
          // Ao trocar o ingrediente, assume a unidade da embalagem dele
          if (k === 'ingredienteId') {
            const ing = ingMap.get(input.value);
            if (ing) {
              ficha.itens[idx].unidade = ing.unidade;
              row.querySelector('[data-k="unidade"]').value = ing.unidade;
            }
          }
          dirty = true;
          paintCustoLinha(row, idx);
          paintSummary();
        });
      });

      row.querySelector('[data-remove]').addEventListener('click', () => {
        ficha.itens.splice(idx, 1);
        dirty = true;
        paintItens();
        paintSummary();
      });

      paintCustoLinha(row, idx);
    });

    // selects de ingrediente viram busca (essencial com muitos insumos)
    upgradeSelects(itensEl);
  }

  function paintCustoLinha(row, idx) {
    const item = ficha.itens[idx];
    const c = custoItem(item, ingMap.get(item.ingredienteId));
    row.querySelector('[data-custo]').textContent = c ? money(c) : '—';
  }

  function addItem() {
    ficha.itens.push({ ingredienteId: '', qtd: 0, unidade: 'g', perda: 0 });
    dirty = true;
    paintItens();
    paintSummary();
    // foca o select recém-criado
    itensEl.querySelector('.ficha-row[data-idx]:last-child [data-k="ingredienteId"]')?.focus();
  }

  container.querySelector('[data-add]').addEventListener('click', addItem);

  /* --------------------------- campos da receita --------------------------- */

  container.querySelectorAll('[data-f]').forEach((input) => {
    input.addEventListener('input', () => {
      const k = input.dataset.f;
      ficha[k] = (k === 'preparo') ? input.value : parseMoney(input.value);
      dirty = true;
      if (k === 'rendimento') paintSummary();
    });
  });

  /* ----------------------------- painel de custo --------------------------- */

  function paintSummary() {
    const custo = custoPorcao({ ficha }, ingMap);
    const temCusto = ficha.itens.some((i) => i.ingredienteId && i.qtd > 0);

    if (!temCusto) {
      summaryEl.innerHTML = `
        <div class="card__head"><h2>Custo e margens</h2></div>
        <div class="card__body">
          <p class="text-2">Adicione ingredientes com quantidade para calcular custo, CMV e margem por canal.</p>
        </div>`;
      return;
    }

    const custoTotal = custo * Math.max(1, ficha.rendimento || 1);
    const canaisRows = Object.entries(canais)
      .filter(([canal]) => produto.precos?.[canal])
      .map(([canal, cfg]) => {
        const a = analisarCanal(custo, produto.precos[canal], {
          comissao: cfg.comissao ?? 0,
          embalagem: produto.taxaEmbalagem ?? 0,
        });
        const cls = a.lucro <= 0 ? 'text-danger' : a.cmvPct > metaCmv ? 'text-warning' : 'text-success';
        return `
          <div class="stat-row">
            <span class="text-2">${esc(cfg.nome)} <span class="text-3 tnum">(${money(produto.precos[canal])})</span></span>
            <span class="tnum"><span class="${cls}">${pct(a.cmvPct)}</span> · lucro ${money(a.lucro)}</span>
          </div>`;
      }).join('');

    const sugerido = precosSugeridos(custo, {
      margemIdeal: produto.margemIdeal ?? 65,
      margemMinima: produto.margemMinima ?? 50,
      embalagem: produto.taxaEmbalagem ?? 0,
    });

    summaryEl.innerHTML = `
      <div class="card__head"><h2>Custo e margens</h2></div>
      <div class="card__body" style="display:flex;flex-direction:column;gap:var(--sp-4)">
        <div style="display:flex;gap:var(--sp-4)">
          <div style="flex:1">
            <div class="kpi__label">Custo da receita</div>
            <div class="kpi__value tnum" style="font-size:var(--text-xl)">${money(custoTotal)}</div>
          </div>
          <div style="flex:1">
            <div class="kpi__label">Custo por porção</div>
            <div class="kpi__value tnum" style="font-size:var(--text-xl);color:var(--primary)">${money(custo)}</div>
          </div>
        </div>

        ${canaisRows ? `
          <div>
            <div class="sidebar__group" style="padding:0 0 var(--sp-2)">CMV por canal</div>
            ${canaisRows}
          </div>` : `
          <p class="text-3" style="font-size:var(--text-sm)">
            Defina os preços de venda no cadastro do produto para ver o CMV por canal.
          </p>`}

        <div>
          <div class="sidebar__group" style="padding:0 0 var(--sp-2)">Preços sugeridos (balcão)</div>
          <div class="stat-row"><span class="text-2">Ideal (margem ${produto.margemIdeal ?? 65}%)</span><strong class="tnum">${money(sugerido.ideal)}</strong></div>
          <div class="stat-row"><span class="text-2">Mínimo (margem ${produto.margemMinima ?? 50}%)</span><strong class="tnum">${money(sugerido.minimo)}</strong></div>
          <div class="stat-row"><span class="text-2">Psicológico</span><strong class="tnum">${money(sugerido.psicologico)}</strong></div>
        </div>
      </div>`;
  }

  /* --------------------------------- salvar -------------------------------- */

  container.querySelector('[data-salvar]').addEventListener('click', async (e) => {
    const itensValidos = ficha.itens.filter((i) => i.ingredienteId && i.qtd > 0);
    const restore = btnLoading(e.currentTarget);
    try {
      await db.update('produtos', produto.id, {
        ficha: { ...ficha, itens: itensValidos, rendimento: Math.max(1, ficha.rendimento || 1) },
      });
      dirty = false;
      restore();
      toast.success('Ficha salva', `${itensValidos.length} ingrediente(s) · custo atualizado.`);
    } catch (err) {
      restore();
      toast.error('Não foi possível salvar', err.message);
    }
  });

  /* -------------------------------- versões -------------------------------- */

  container.querySelector('[data-versoes]').addEventListener('click', async () => {
    const versoes = (await db.all('fichaVersoes'))
      .filter((v) => v.produtoId === produto.id)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

    const content = document.createElement('div');
    content.innerHTML = `
      <div class="field" style="margin-bottom:var(--sp-4)">
        <label class="field__label">Salvar a ficha atual como versão</label>
        <div style="display:flex;gap:var(--sp-2)">
          <input class="input" data-label placeholder="Ex.: Receita original, Promoção…" style="flex:1" />
          <button class="btn btn--primary" data-snap>${icon('plus', 15)} Salvar versão</button>
        </div>
      </div>
      <div data-vlist>
        ${versoes.length ? versoes.map((v) => `
          <div class="price-history__row" data-vid="${v.id}">
            <span>
              <strong>${esc(v.label || 'Sem rótulo')}</strong>
              <span class="text-3" style="font-size:var(--text-xs)"> · ${dateRelative(v.createdAt)} · ${v.ficha?.itens?.length ?? 0} ingr.</span>
            </span>
            <span style="display:flex;gap:var(--sp-1)">
              <button class="btn btn--sm btn--secondary" data-restore>Restaurar</button>
              <button class="icon-btn" data-vdel aria-label="Excluir versão">${icon('trash', 15)}</button>
            </span>
          </div>`).join('')
        : '<p class="text-2">Nenhuma versão salva ainda.</p>'}
      </div>`;

    const m = openModal({ title: `Versões — ${produto.nome}`, content, size: 'lg' });

    content.querySelector('[data-snap]').addEventListener('click', async (e) => {
      const restore = btnLoading(e.currentTarget);
      try {
        await db.insert('fichaVersoes', {
          produtoId: produto.id,
          label: content.querySelector('[data-label]').value.trim(),
          ficha: { ...ficha, itens: ficha.itens.filter((i) => i.ingredienteId) },
        });
        m.close();
        toast.success('Versão salva', 'A ficha atual foi arquivada.');
      } catch (err) {
        restore();
        toast.error('Não foi possível salvar', err.message);
      }
    });

    content.querySelectorAll('[data-vid]').forEach((row) => {
      const v = versoes.find((x) => x.id === row.dataset.vid);

      row.querySelector('[data-restore]').addEventListener('click', () => {
        Object.assign(ficha, {
          itens: (v.ficha?.itens ?? []).map((it) => ({ ...it })),
          rendimento: v.ficha?.rendimento ?? 1,
          pesoFinal: v.ficha?.pesoFinal ?? '',
          tempoMin: v.ficha?.tempoMin ?? '',
          preparo: v.ficha?.preparo ?? '',
        });
        dirty = true;
        m.close();
        paintItens();
        paintSummary();
        container.querySelectorAll('[data-f]').forEach((inp) => {
          inp.value = ficha[inp.dataset.f] ?? '';
        });
        toast.info('Versão carregada no editor', 'Clique em "Salvar ficha" para aplicar.');
      });

      row.querySelector('[data-vdel]').addEventListener('click', async () => {
        await db.remove('fichaVersoes', v.id);
        row.remove();
        toast.success('Versão excluída');
      });
    });
  });

  /* ----------------------- duplicar de outro produto ----------------------- */

  container.querySelector('[data-duplicar]').addEventListener('click', async () => {
    const produtos = (await db.all('produtos'))
      .filter((p) => p.id !== produto.id && p.ficha?.itens?.length);

    if (!produtos.length) {
      toast.info('Nada para copiar', 'Nenhum outro produto tem ficha técnica ainda.');
      return;
    }

    const content = document.createElement('div');
    content.innerHTML = `
      <div class="field">
        <label class="field__label">Copiar a ficha de</label>
        <select class="input" data-origem>
          ${produtos.map((p) => `<option value="${p.id}">${esc(p.nome)} (${p.ficha.itens.length} ingr.)</option>`).join('')}
        </select>
        <span class="field__hint">A ficha atual será substituída no editor (nada é salvo até você clicar em Salvar).</span>
      </div>`;
    const footer = document.createElement('div');
    footer.style.display = 'contents';
    footer.innerHTML = `
      <button class="btn btn--secondary" data-cancel>Cancelar</button>
      <button class="btn btn--primary" data-ok>Copiar ficha</button>`;

    const m = openModal({ title: 'Copiar ficha técnica', content, footer });
    footer.querySelector('[data-cancel]').addEventListener('click', () => m.close());
    footer.querySelector('[data-ok]').addEventListener('click', () => {
      const origem = produtos.find((p) => p.id === content.querySelector('[data-origem]').value);
      Object.assign(ficha, {
        itens: origem.ficha.itens.map((it) => ({ ...it })),
        rendimento: origem.ficha.rendimento ?? 1,
        pesoFinal: origem.ficha.pesoFinal ?? '',
        tempoMin: origem.ficha.tempoMin ?? '',
        preparo: origem.ficha.preparo ?? '',
      });
      dirty = true;
      m.close();
      paintItens();
      paintSummary();
      container.querySelectorAll('[data-f]').forEach((inp) => {
        inp.value = ficha[inp.dataset.f] ?? '';
      });
      toast.success('Ficha copiada', `Base: ${origem.nome}. Ajuste e salve.`);
    });
  });

  paintItens();
  paintSummary();
}

/* ========================================================================
   Entrada do módulo
   ===================================================================== */

export default {
  async render(container, ctx) {
    if (ctx.params?.[0]) {
      await renderEditor(container, ctx.params[0], ctx);
    } else {
      await renderLista(container, ctx);
    }
  },

  destroy() {
    offDb?.(); offDb = null;
  },
};
