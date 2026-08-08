/**
 * CMV Pro — Categorias
 * --------------------
 * Organiza ingredientes e produtos em categorias com cor. Duas seções
 * (Ingredientes / Produtos) com CRUD completo e contagem de itens.
 * Ao excluir uma categoria em uso, os itens ficam "Sem categoria".
 */

import { db } from '../services/db.js';
import { esc } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { emptyState, pageHead, tableSkeleton, btnLoading } from '../components/ui.js';
import { bus } from '../core/events.js';

/** Paleta fixa de cores para categorias (mesma família dos tokens). */
const CORES = ['#2563EB', '#0E9888', '#B45309', '#7C3AED', '#DC2626', '#16A34A', '#F59E0B', '#64748B'];

let offDb = null;

/* ------------------------------ formulário ------------------------------ */

function abrirForm(cat, tipoInicial = 'ingrediente') {
  const isEdit = Boolean(cat?.id);
  const corAtual = cat?.cor ?? CORES[0];

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-grid">
      <div class="field span-2">
        <label class="field__label">Nome <span class="req">*</span></label>
        <input class="input" name="nome" value="${esc(cat?.nome ?? '')}" placeholder="Ex.: Carnes, Hambúrgueres…" />
        <span class="field__error" role="alert"></span>
      </div>
      <div class="field">
        <label class="field__label">Tipo</label>
        <select class="input" name="tipo" ${isEdit ? 'disabled' : ''}>
          <option value="ingrediente" ${(cat?.tipo ?? tipoInicial) === 'ingrediente' ? 'selected' : ''}>Ingredientes</option>
          <option value="produto" ${(cat?.tipo ?? tipoInicial) === 'produto' ? 'selected' : ''}>Produtos</option>
        </select>
        ${isEdit ? '<span class="field__hint">O tipo não muda após a criação.</span>' : ''}
      </div>
      <div class="field">
        <label class="field__label">Cor</label>
        <div class="color-swatches" role="radiogroup" aria-label="Cor da categoria">
          ${CORES.map((c) => `
            <button type="button" class="color-swatch ${c === corAtual ? 'is-active' : ''}"
              data-cor="${c}" style="background:${c}" role="radio"
              aria-checked="${c === corAtual}" aria-label="Cor ${c}"></button>`).join('')}
        </div>
      </div>
    </div>`;

  let corSelecionada = corAtual;
  content.querySelectorAll('.color-swatch').forEach((b) =>
    b.addEventListener('click', () => {
      corSelecionada = b.dataset.cor;
      content.querySelectorAll('.color-swatch').forEach((x) => {
        x.classList.toggle('is-active', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
    }));

  const footer = document.createElement('div');
  footer.style.display = 'contents';
  footer.innerHTML = `
    <button class="btn btn--secondary" data-cancel>Cancelar</button>
    <button class="btn btn--primary" data-save>${isEdit ? 'Salvar' : 'Criar categoria'}</button>`;

  const m = openModal({ title: isEdit ? `Editar — ${cat.nome}` : 'Nova categoria', content, footer });

  footer.querySelector('[data-cancel]').addEventListener('click', () => m.close());
  footer.querySelector('[data-save]').addEventListener('click', async (e) => {
    const nomeInput = content.querySelector('[name="nome"]');
    const nome = nomeInput.value.trim();
    const fieldEl = nomeInput.closest('.field');
    fieldEl.classList.toggle('has-error', !nome);
    if (!nome) {
      fieldEl.querySelector('.field__error').textContent = 'Informe o nome da categoria.';
      return;
    }
    const restore = btnLoading(e.currentTarget);
    try {
      if (isEdit) {
        await db.update('categorias', cat.id, { nome, cor: corSelecionada });
        toast.success('Categoria atualizada', nome);
      } else {
        await db.insert('categorias', {
          nome, cor: corSelecionada,
          tipo: content.querySelector('[name="tipo"]').value,
        });
        toast.success('Categoria criada', nome);
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
      title: 'Categorias',
      subtitle: 'Organize ingredientes e produtos para filtrar e analisar por grupo.',
      actions: `<button class="btn btn--primary" data-new>${icon('plus', 17)} Nova categoria</button>`,
    }) + `<div data-list>${tableSkeleton(4)}</div>`;

    ctx.setFab?.({ label: 'Nova categoria', onClick: () => abrirForm(null) });
    container.querySelector('[data-new]').addEventListener('click', () => abrirForm(null));

    const listEl = container.querySelector('[data-list]');

    const paint = async () => {
      const [categorias, ingredientes, produtos] = await Promise.all([
        db.all('categorias'), db.all('ingredientes'), db.all('produtos'),
      ]);

      /** Quantos itens usam a categoria. */
      const contar = (cat) =>
        (cat.tipo === 'ingrediente' ? ingredientes : produtos)
          .filter((x) => x.categoriaId === cat.id).length;

      const secao = (tipo, titulo, icone) => {
        const cats = categorias
          .filter((c) => c.tipo === tipo)
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        return `
          <div class="card anim-in">
            <div class="card__head">
              <h2>${icon(icone, 18)} ${titulo}</h2>
              <span class="badge badge--neutral">${cats.length}</span>
              <button class="btn btn--sm btn--ghost" data-add="${tipo}">${icon('plus', 15)} Adicionar</button>
            </div>
            ${cats.length ? `
              <div class="rank-list">
                ${cats.map((c) => `
                  <div class="rank-item" data-id="${c.id}">
                    <span class="color-dot" style="background:${esc(c.cor ?? '#64748B')}"></span>
                    <span class="rank-item__name truncate">${esc(c.nome)}</span>
                    <span class="badge badge--neutral">${contar(c)} ite${contar(c) === 1 ? 'm' : 'ns'}</span>
                    <button class="icon-btn" data-edit aria-label="Editar ${esc(c.nome)}">${icon('edit', 16)}</button>
                    <button class="icon-btn" data-del aria-label="Excluir ${esc(c.nome)}">${icon('trash', 16)}</button>
                  </div>`).join('')}
              </div>`
            : `<div class="empty-state" style="padding:var(--sp-8)">
                 <p class="text-2">Nenhuma categoria de ${tipo === 'ingrediente' ? 'ingredientes' : 'produtos'} ainda.</p>
               </div>`}
          </div>`;
      };

      listEl.innerHTML = `
        <div class="grid grid--2">
          ${secao('ingrediente', 'Ingredientes', 'carrot')}
          ${secao('produto', 'Produtos', 'package')}
        </div>`;

      listEl.querySelectorAll('[data-add]').forEach((b) =>
        b.addEventListener('click', () => abrirForm(null, b.dataset.add)));

      listEl.querySelectorAll('.rank-item[data-id]').forEach((row) => {
        const cat = categorias.find((c) => c.id === row.dataset.id);

        row.querySelector('[data-edit]').addEventListener('click', () => abrirForm(cat));

        row.querySelector('[data-del]').addEventListener('click', async () => {
          const n = contar(cat);
          const ok = await confirmDialog({
            title: `Excluir ${cat.nome}?`,
            message: n
              ? `${n} ite${n === 1 ? 'm ficará' : 'ns ficarão'} "Sem categoria". Esta ação não pode ser desfeita.`
              : 'Esta ação não pode ser desfeita.',
            confirmLabel: 'Excluir',
            danger: true,
          });
          if (!ok) return;

          // Solta os itens antes de excluir (no Supabase o FK também faz
          // SET NULL — aqui garantimos o mesmo comportamento no modo local)
          const colecao = cat.tipo === 'ingrediente' ? 'ingredientes' : 'produtos';
          const afetados = (cat.tipo === 'ingrediente' ? ingredientes : produtos)
            .filter((x) => x.categoriaId === cat.id);
          for (const item of afetados) {
            await db.update(colecao, item.id, { categoriaId: null });
          }
          await db.remove('categorias', cat.id);
          toast.success('Categoria excluída', cat.nome);
        });
      });
    };

    await paint();
    offDb = bus.on('db:changed', ({ collection }) => {
      if (['categorias', 'ingredientes', 'produtos', '*'].includes(collection)) paint();
    });
  },

  destroy() {
    offDb?.(); offDb = null;
  },
};
