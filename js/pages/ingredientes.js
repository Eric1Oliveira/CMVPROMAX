/**
 * CMV Pro — Ingredientes
 * ----------------------
 * Cadastro completo de insumos: preço por embalagem, custo por unidade-base,
 * histórico de preços, estoque, fornecedor e categoria. Inclui:
 *  - pesquisa instantânea + filtros por categoria + ordenação;
 *  - importar/exportar CSV;
 *  - duplicar ingrediente;
 *  - histórico de preço com variação;
 *  - FAB no mobile para novo ingrediente.
 */

import { db } from '../services/db.js';
import { custoUnitario, precoMedio } from '../services/calc.js';
import {
  money, num, esc, initials, parseMoney, dateShort, UNIDADES, toBase,
} from '../utils/format.js';
import { downloadCsv, parseCsv, pickCsvFile } from '../utils/csv.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { upgradeSelect } from '../components/combobox.js';
import { removeWithUndo } from '../components/undo.js';
import { emptyState, tableSkeleton, pageHead, trendBadge, btnLoading } from '../components/ui.js';
import { bus } from '../core/events.js';

/* ------------------------------ estado local ---------------------------- */

const state = {
  busca: '',
  categoriaId: '',      // '' = todas
  ordem: 'nome',        // nome | preco | atualizado
};

let offDb = null;
let menuAberto = null;  // dropdown de ações aberto no momento

/* -------------------------------- helpers ------------------------------- */

/** Rótulo curto da embalagem: "5 kg", "12 un". */
const embalagemLabel = (i) => `${num(i.qtdEmbalagem ?? 1)} ${i.unidade}`;

/** Custo por unidade-base formatado: "R$ 0,042/g". */
function custoBaseLabel(i) {
  const { base } = toBase(1, i.unidade);
  const c = custoUnitario(i);
  const casas = c < 0.1 ? 3 : 2;
  return `${c.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas })}/${base}`;
}

/** Fecha o dropdown de ações aberto (se houver). */
function fecharMenu() {
  menuAberto?.remove();
  menuAberto = null;
}

/* ----------------------------- formulário ------------------------------- */

/**
 * Modal de criar/editar ingrediente.
 * @param {object|null} ing  ingrediente existente (edição) ou null (novo)
 */
async function abrirForm(ing, { categorias, fornecedores }) {
  const isEdit = Boolean(ing?.id);
  const catIng = categorias.filter((c) => c.tipo === 'ingrediente');

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-grid">
      <div class="field span-2">
        <label class="field__label">Nome <span class="req">*</span></label>
        <input class="input" name="nome" value="${esc(ing?.nome ?? '')}" placeholder="Ex.: Queijo mussarela" />
        <span class="field__error" role="alert"></span>
      </div>

      <div class="field">
        <label class="field__label">Categoria</label>
        <select class="input" name="categoriaId" data-create>
          <option value="">Sem categoria</option>
          ${catIng.map((c) => `<option value="${c.id}" ${ing?.categoriaId === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label class="field__label">Fornecedor</label>
        <select class="input" name="fornecedorId" data-create>
          <option value="">Sem fornecedor</option>
          ${fornecedores.map((f) => `<option value="${f.id}" ${ing?.fornecedorId === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label class="field__label">Código interno</label>
        <input class="input" name="codigo" value="${esc(ing?.codigo ?? '')}" placeholder="ING-0001" />
      </div>

      <div class="field">
        <label class="field__label">Unidade da embalagem <span class="req">*</span></label>
        <select class="input" name="unidade">
          ${UNIDADES.map((u) => `<option value="${u.id}" ${ (ing?.unidade ?? 'kg') === u.id ? 'selected' : ''}>${u.nome}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label class="field__label">Tamanho da embalagem <span class="req">*</span></label>
        <input class="input" name="qtdEmbalagem" inputmode="decimal"
          value="${ing?.qtdEmbalagem ?? 1}" placeholder="Ex.: 5" />
        <span class="field__hint">Quantos kg/L/un vêm na embalagem comprada.</span>
        <span class="field__error" role="alert"></span>
      </div>

      <div class="field">
        <label class="field__label">Preço da embalagem <span class="req">*</span></label>
        <div class="input-group">
          <span class="input-group__affix">R$</span>
          <input class="input" name="preco" data-mask="money"
            value="${ing?.preco != null ? String(ing.preco).replace('.', ',') : ''}" placeholder="0,00" />
        </div>
        <span class="field__error" role="alert"></span>
      </div>

      <div class="field">
        <label class="field__label">Estoque atual</label>
        <input class="input" name="estoque" inputmode="decimal" value="${ing?.estoque ?? ''}" placeholder="0" />
      </div>

      <div class="field">
        <label class="field__label">Estoque mínimo</label>
        <input class="input" name="estoqueMin" inputmode="decimal" value="${ing?.estoqueMin ?? ''}" placeholder="0" />
        <span class="field__hint">Abaixo disso, você recebe um alerta.</span>
      </div>

      <div class="field span-2">
        <label class="field__label">Observações</label>
        <textarea class="input" name="observacoes" placeholder="Anotações sobre o insumo, entregas, marcas preferidas…">${esc(ing?.observacoes ?? '')}</textarea>
      </div>
    </div>
  `;

  const footer = document.createElement('div');
  footer.style.display = 'contents';
  footer.innerHTML = `
    <button class="btn btn--secondary" data-cancel>Cancelar</button>
    ${isEdit ? '' : '<button class="btn btn--ghost" data-save-new>Salvar e adicionar outro</button>'}
    <button class="btn btn--primary" data-save>${isEdit ? 'Salvar alterações' : 'Adicionar ingrediente'}</button>
  `;

  const m = openModal({
    title: isEdit ? `Editar — ${ing.nome}` : 'Novo ingrediente',
    content, footer, size: 'lg',
  });

  // Selects de categoria/fornecedor viram busca COM "criar «texto»" embutido.
  upgradeSelect(content.querySelector('[name="categoriaId"]'), {
    onCreate: async (nome) => {
      const c = await db.insert('categorias', { nome, tipo: 'ingrediente', cor: '#2563EB' });
      toast.success('Categoria criada', nome);
      return { id: c.id, nome };
    },
  });
  upgradeSelect(content.querySelector('[name="fornecedorId"]'), {
    onCreate: async (nome) => {
      const f = await db.insert('fornecedores', { nome, contato: '' });
      toast.success('Fornecedor criado', nome);
      return { id: f.id, nome };
    },
  });

  const get = (n) => content.querySelector(`[name="${n}"]`);
  const setErr = (n, msg) => {
    const f = get(n).closest('.field');
    f.classList.toggle('has-error', Boolean(msg));
    const el = f.querySelector('.field__error');
    if (el && msg) el.textContent = msg;
  };

  async function salvar(btn, { keepOpen = false } = {}) {
    const nome = get('nome').value.trim();
    const preco = parseMoney(get('preco').value);
    const qtdEmb = parseMoney(get('qtdEmbalagem').value);
    setErr('nome', nome ? '' : 'Informe o nome do ingrediente.');
    setErr('preco', preco > 0 ? '' : 'Informe o preço pago pela embalagem.');
    setErr('qtdEmbalagem', qtdEmb > 0 ? '' : 'Informe o tamanho da embalagem.');
    if (!nome || preco <= 0 || qtdEmb <= 0) return;

    const doc = {
      nome,
      categoriaId: get('categoriaId').value || null,
      fornecedorId: get('fornecedorId').value || null,
      codigo: get('codigo').value.trim(),
      unidade: get('unidade').value,
      qtdEmbalagem: qtdEmb,
      preco,
      estoque: get('estoque').value === '' ? null : parseMoney(get('estoque').value),
      estoqueMin: get('estoqueMin').value === '' ? null : parseMoney(get('estoqueMin').value),
      observacoes: get('observacoes').value.trim(),
    };

    const restore = btnLoading(btn);
    try {
      if (isEdit) {
        if (preco !== ing.preco) {
          doc.precoAnterior = ing.preco;
          doc.historico = [...(ing.historico ?? []), { data: new Date().toISOString(), preco }];
        }
        await db.update('ingredientes', ing.id, doc);
        toast.success('Ingrediente atualizado', nome);
        m.close();
      } else {
        doc.historico = [{ data: new Date().toISOString(), preco }];
        doc.precoAnterior = null;
        await db.insert('ingredientes', doc);
        toast.success('Ingrediente adicionado', nome);
        if (keepOpen) {
          // limpa os campos do item e mantém categoria/fornecedor/unidade
          restore();
          ['nome', 'codigo', 'preco', 'estoque'].forEach((n) => { get(n).value = ''; });
          get('nome').focus();
        } else {
          m.close();
        }
      }
    } catch (err) {
      restore();
      toast.error('Não foi possível salvar', err.message);
    }
  }

  footer.querySelector('[data-cancel]').addEventListener('click', () => m.close());
  footer.querySelector('[data-save]').addEventListener('click', (e) => salvar(e.currentTarget));
  footer.querySelector('[data-save-new]')?.addEventListener('click', (e) => salvar(e.currentTarget, { keepOpen: true }));
}

/* --------------------------- histórico de preço -------------------------- */

function abrirHistorico(ing) {
  const hist = [...(ing.historico ?? [])].reverse();
  openModal({
    title: `Histórico — ${ing.nome}`,
    content: `
      <div style="display:flex;gap:var(--sp-4);margin-bottom:var(--sp-4)">
        <div class="card kpi" style="flex:1">
          <span class="kpi__label">Preço atual</span>
          <span class="kpi__value tnum" style="font-size:var(--text-xl)">${money(ing.preco)}</span>
        </div>
        <div class="card kpi" style="flex:1">
          <span class="kpi__label">Preço médio</span>
          <span class="kpi__value tnum" style="font-size:var(--text-xl)">${money(precoMedio(ing))}</span>
        </div>
      </div>
      <div class="price-history">
        ${hist.length ? hist.map((h, idx) => {
          const anterior = hist[idx + 1]?.preco;
          return `
            <div class="price-history__row">
              <span class="text-2">${dateShort(h.data)}</span>
              <span style="display:flex;align-items:center;gap:var(--sp-3)">
                ${anterior ? trendBadge(h.preco, anterior) : ''}
                <strong class="tnum">${money(h.preco)}</strong>
              </span>
            </div>`;
        }).join('') : '<p class="text-2">Ainda não há histórico registrado.</p>'}
      </div>`,
  });
}

/* ------------------------------ CSV import ------------------------------ */

const CSV_HEADERS = ['nome', 'categoria', 'fornecedor', 'codigo', 'unidade', 'qtdEmbalagem', 'preco', 'estoque', 'estoqueMin', 'observacoes'];

async function exportarCsv(itens, categorias, fornecedores) {
  const catNome = (id) => categorias.find((c) => c.id === id)?.nome ?? '';
  const fornNome = (id) => fornecedores.find((f) => f.id === id)?.nome ?? '';
  downloadCsv(
    'ingredientes.csv',
    CSV_HEADERS,
    itens.map((i) => [
      i.nome, catNome(i.categoriaId), fornNome(i.fornecedorId), i.codigo ?? '',
      i.unidade, i.qtdEmbalagem ?? 1, String(i.preco).replace('.', ','),
      i.estoque ?? '', i.estoqueMin ?? '', i.observacoes ?? '',
    ])
  );
  toast.success('CSV exportado', `${itens.length} ingrediente(s).`);
}

async function importarCsv() {
  let text;
  try {
    text = await pickCsvFile();
  } catch {
    return; // usuário cancelou
  }

  const { headers, rows } = parseCsv(text);
  const idx = Object.fromEntries(CSV_HEADERS.map((h) => [h, headers.findIndex((x) => x.toLowerCase() === h.toLowerCase())]));
  if (idx.nome === -1 || idx.preco === -1) {
    toast.error('CSV inválido', 'O arquivo precisa das colunas "nome" e "preco".');
    return;
  }

  const categorias = await db.all('categorias');
  const fornecedores = await db.all('fornecedores');

  /** Resolve (ou cria) categoria/fornecedor pelo nome. */
  async function resolver(colecao, lista, nome, extra = {}) {
    if (!nome) return null;
    const found = lista.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
    if (found) return found.id;
    const created = await db.insert(colecao, { nome, ...extra });
    lista.push(created);
    return created.id;
  }

  let ok = 0;
  for (const r of rows) {
    const get = (h) => (idx[h] >= 0 ? (r[idx[h]] ?? '').trim() : '');
    const nome = get('nome');
    const preco = parseMoney(get('preco'));
    if (!nome || preco <= 0) continue;

    await db.insert('ingredientes', {
      nome,
      categoriaId: await resolver('categorias', categorias, get('categoria'), { tipo: 'ingrediente', cor: '#2563EB' }),
      fornecedorId: await resolver('fornecedores', fornecedores, get('fornecedor')),
      codigo: get('codigo'),
      unidade: UNIDADES.some((u) => u.id === get('unidade')) ? get('unidade') : 'un',
      qtdEmbalagem: parseMoney(get('qtdEmbalagem')) || 1,
      preco,
      precoAnterior: null,
      historico: [{ data: new Date().toISOString(), preco }],
      estoque: get('estoque') === '' ? null : parseMoney(get('estoque')),
      estoqueMin: get('estoqueMin') === '' ? null : parseMoney(get('estoqueMin')),
      observacoes: get('observacoes'),
    });
    ok++;
  }
  toast.success('Importação concluída', `${ok} ingrediente(s) importado(s).`);
}

/* --------------------------------- página -------------------------------- */

export default {
  async render(container, ctx) {
    // Busca global vinda da topbar
    const globalSearch = sessionStorage.getItem('cmvpro:search');
    if (globalSearch) {
      state.busca = globalSearch;
      sessionStorage.removeItem('cmvpro:search');
    }

    container.innerHTML = pageHead({
      title: 'Ingredientes',
      subtitle: 'Seus insumos com custo real por unidade e histórico de preços.',
      actions: `
        <button class="btn btn--ghost" data-import>${icon('upload', 17)} Importar</button>
        <button class="btn btn--secondary" data-export>${icon('download', 17)} Exportar</button>
        <button class="btn btn--primary" data-new>${icon('plus', 17)} Novo ingrediente</button>`,
    }) + `<div data-list>${tableSkeleton()}</div>`;

    // FAB do mobile espelha a ação primária
    ctx.setFab?.({ label: 'Novo ingrediente', onClick: () => novo() });

    const listEl = container.querySelector('[data-list]');
    let cache = { ingredientes: [], categorias: [], fornecedores: [] };

    const novo = () => abrirForm(null, cache);

    container.querySelector('[data-new]').addEventListener('click', novo);
    container.querySelector('[data-import]').addEventListener('click', importarCsv);
    container.querySelector('[data-export]').addEventListener('click', () =>
      exportarCsv(aplicarFiltros(cache.ingredientes), cache.categorias, cache.fornecedores));

    /* --------------------- filtros em memória --------------------- */
    function aplicarFiltros(itens) {
      let out = [...itens];
      const q = state.busca.trim().toLowerCase();
      if (q) {
        out = out.filter((i) =>
          i.nome.toLowerCase().includes(q) ||
          (i.codigo ?? '').toLowerCase().includes(q) ||
          (cache.fornecedores.find((f) => f.id === i.fornecedorId)?.nome ?? '').toLowerCase().includes(q));
      }
      if (state.categoriaId) out = out.filter((i) => i.categoriaId === state.categoriaId);

      const sorters = {
        nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
        preco: (a, b) => (b.preco ?? 0) - (a.preco ?? 0),
        atualizado: (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
      };
      return out.sort(sorters[state.ordem] ?? sorters.nome);
    }

    /* ------------------------- renderização ------------------------ */
    const paint = async () => {
      const [ingredientes, categorias, fornecedores] = await Promise.all([
        db.all('ingredientes'), db.all('categorias'), db.all('fornecedores'),
      ]);
      cache = { ingredientes, categorias, fornecedores };
      const catIng = categorias.filter((c) => c.tipo === 'ingrediente');

      if (!ingredientes.length) {
        listEl.innerHTML = emptyState({
          iconName: 'carrot',
          title: 'Nenhum ingrediente ainda',
          text: 'Cadastre seus insumos para o CMV Pro calcular o custo real de cada produto.',
          actionLabel: 'Adicionar primeiro ingrediente',
          actionId: 'first-ing',
        });
        listEl.querySelector('#first-ing')?.addEventListener('click', novo);
        return;
      }

      const itens = aplicarFiltros(ingredientes);
      const catNome = (id) => catIng.find((c) => c.id === id)?.nome;
      const fornNome = (id) => fornecedores.find((f) => f.id === id)?.nome ?? '—';

      listEl.innerHTML = `
        <div class="toolbar anim-in">
          <label class="toolbar__search">
            ${icon('search', 17)}
            <input type="search" placeholder="Buscar por nome, código ou fornecedor…"
              value="${esc(state.busca)}" data-busca aria-label="Buscar ingredientes" />
          </label>
          <div class="toolbar__filters">
            <button class="chip ${!state.categoriaId ? 'is-active' : ''}" data-cat="">Todas</button>
            ${catIng.map((c) => `
              <button class="chip ${state.categoriaId === c.id ? 'is-active' : ''}" data-cat="${c.id}">
                ${esc(c.nome)}
              </button>`).join('')}
            <select class="input" data-ordem style="width:auto;height:32px;font-size:var(--text-sm)">
              <option value="nome" ${state.ordem === 'nome' ? 'selected' : ''}>Nome A–Z</option>
              <option value="preco" ${state.ordem === 'preco' ? 'selected' : ''}>Maior preço</option>
              <option value="atualizado" ${state.ordem === 'atualizado' ? 'selected' : ''}>Atualizados</option>
            </select>
          </div>
        </div>

        ${itens.length ? `
        <div class="card anim-in">
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Ingrediente</th>
                  <th>Fornecedor</th>
                  <th class="cell-num">Embalagem</th>
                  <th class="cell-num">Preço</th>
                  <th class="cell-num">Custo base</th>
                  <th class="cell-num">Variação</th>
                  <th class="cell-num">Estoque</th>
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
                        <div style="min-width:0">
                          <div class="entity__name truncate">${esc(i.nome)}</div>
                          <div class="entity__meta">
                            ${i.codigo ? `${esc(i.codigo)} · ` : ''}${esc(catNome(i.categoriaId) ?? 'Sem categoria')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="text-2">${esc(fornNome(i.fornecedorId))}</td>
                    <td class="cell-num text-2">${embalagemLabel(i)}</td>
                    <td class="cell-num"><strong>${money(i.preco)}</strong></td>
                    <td class="cell-num text-2">${custoBaseLabel(i)}</td>
                    <td class="cell-num">${trendBadge(i.preco, i.precoAnterior)}</td>
                    <td class="cell-num">
                      ${i.estoque == null ? '<span class="text-3">—</span>' : `
                        <span class="badge ${baixo ? 'badge--danger' : 'badge--neutral'}">
                          ${num(i.estoque)} ${i.unidade}
                        </span>`}
                    </td>
                    <td class="cell-actions">
                      <button class="icon-btn" data-menu-btn aria-label="Ações de ${esc(i.nome)}">
                        ${icon('more-v', 18)}
                      </button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <p class="text-3" style="margin-top:var(--sp-3);font-size:var(--text-sm)">
          ${itens.length} de ${ingredientes.length} ingrediente(s)
        </p>`
        : emptyState({
            iconName: 'search',
            title: 'Nada encontrado',
            text: 'Tente outro termo de busca ou remova os filtros.',
          })}
      `;

      /* ------------------------ eventos da lista ------------------------ */

      // Busca instantânea (input) — re-render apenas da lista
      const busca = listEl.querySelector('[data-busca]');
      busca?.addEventListener('input', () => {
        state.busca = busca.value;
        // debounce leve para não re-renderizar a cada tecla em listas grandes
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
        c.addEventListener('click', () => {
          state.categoriaId = c.dataset.cat;
          paint();
        }));

      listEl.querySelector('[data-ordem]')?.addEventListener('change', (e) => {
        state.ordem = e.target.value;
        paint();
      });

      // Menu de ações por linha
      listEl.querySelectorAll('[data-menu-btn]').forEach((btn) =>
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          fecharMenu();
          const tr = btn.closest('tr');
          const ing = cache.ingredientes.find((x) => x.id === tr.dataset.id);

          const menu = document.createElement('div');
          menu.className = 'menu';
          menu.innerHTML = `
            <button class="menu__item" data-a="editar">${icon('edit', 16)} Editar</button>
            <button class="menu__item" data-a="duplicar">${icon('copy', 16)} Duplicar</button>
            <button class="menu__item" data-a="historico">${icon('clock', 16)} Histórico de preço</button>
            <div class="menu__sep"></div>
            <button class="menu__item menu__item--danger" data-a="excluir">${icon('trash', 16)} Excluir</button>`;

          document.body.appendChild(menu);
          const r = btn.getBoundingClientRect();
          const mw = menu.offsetWidth;
          menu.style.top = `${Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8)}px`;
          menu.style.left = `${Math.max(8, r.right - mw)}px`;
          menuAberto = menu;

          menu.addEventListener('click', async (ev) => {
            const acao = ev.target.closest('[data-a]')?.dataset.a;
            fecharMenu();
            if (acao === 'editar') abrirForm(ing, cache);
            if (acao === 'historico') abrirHistorico(ing);
            if (acao === 'duplicar') {
              const { id, createdAt, updatedAt, ...rest } = ing;
              await db.insert('ingredientes', { ...rest, nome: `${ing.nome} (cópia)` });
              toast.success('Ingrediente duplicado', `${ing.nome} (cópia)`);
            }
            if (acao === 'excluir') {
              await removeWithUndo('ingredientes', ing, { nome: ing.nome });
            }
          });
        }));
    };

    // Fecha menus ao clicar fora / rolar
    document.addEventListener('click', fecharMenu);
    document.addEventListener('scroll', fecharMenu, true);

    await paint();
    offDb = bus.on('db:changed', ({ collection }) => {
      if (['ingredientes', 'categorias', 'fornecedores', '*'].includes(collection)) paint();
    });
  },

  destroy() {
    offDb?.(); offDb = null;
    fecharMenu();
    document.removeEventListener('click', fecharMenu);
    document.removeEventListener('scroll', fecharMenu, true);
  },
};
