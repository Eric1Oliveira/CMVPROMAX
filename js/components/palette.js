/**
 * CMV Pro — Command palette (Ctrl/⌘ + K)
 * --------------------------------------
 * Um único atalho para chegar em qualquer tela ou disparar uma ação rápida
 * (novo ingrediente, lançar venda…). Estilo Linear/Raycast: abre, digita,
 * Enter. Reduz cliques e deixa o usuário voar pelo sistema.
 */

import { ROUTES } from '../core/nav.js';
import { navigate } from '../core/router.js';
import { icon } from './icons.js';
import { esc } from '../utils/format.js';

const norm = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Ações rápidas (além de navegar): abrem um formulário direto. */
function acoesRapidas() {
  const irEAgir = (rota, fabDelay = 380) => () => {
    navigate(rota);
    // dispara a ação primária da página (mesmo destino do FAB) após montar
    setTimeout(() => document.querySelector('.fab')?.click(), fabDelay);
  };
  return [
    { titulo: 'Novo ingrediente', dica: 'Cadastro', icone: 'plus', run: irEAgir('ingredientes') },
    { titulo: 'Novo produto', dica: 'Cadastro', icone: 'plus', run: irEAgir('produtos') },
    { titulo: 'Nova categoria', dica: 'Cadastro', icone: 'plus', run: irEAgir('categorias') },
    { titulo: 'Lançar venda', dica: 'Financeiro', icone: 'trending-up', run: irEAgir('financeiro') },
    { titulo: 'Novo pedido de compra', dica: 'Compras', icone: 'cart', run: irEAgir('compras') },
  ];
}

let aberto = false;

/** Abre o palette (idempotente). */
export function openPalette() {
  if (aberto) return;
  aberto = true;

  const rotas = ROUTES
    .filter((r) => !r.public && r.group)
    .map((r) => ({ titulo: r.title, dica: r.group, icone: r.icon, run: () => navigate(r.path) }));
  const todos = [...acoesRapidas(), ...rotas];

  const back = document.createElement('div');
  back.className = 'palette-back';
  back.innerHTML = `
    <div class="palette" role="dialog" aria-modal="true" aria-label="Ações rápidas">
      <div class="palette__search">
        ${icon('search', 18)}
        <input type="text" placeholder="Buscar telas e ações…" aria-label="Buscar" />
        <kbd>esc</kbd>
      </div>
      <div class="palette__list" role="listbox"></div>
    </div>`;

  const input = back.querySelector('input');
  const list = back.querySelector('.palette__list');
  let itens = [];
  let active = 0;

  const render = (q = '') => {
    const nq = norm(q);
    itens = todos.filter((c) => norm(c.titulo).includes(nq) || norm(c.dica).includes(nq));
    active = 0;
    list.innerHTML = itens.length ? itens.map((c, i) => `
      <button class="palette__item ${i === 0 ? 'is-active' : ''}" data-i="${i}" role="option">
        <span class="palette__ico">${icon(c.icone, 17)}</span>
        <span class="palette__txt">${esc(c.titulo)}</span>
        <span class="palette__hint">${esc(c.dica)}</span>
      </button>`).join('') : `<div class="cbx__empty" style="padding:var(--sp-6)">Nada encontrado</div>`;

    list.querySelectorAll('.palette__item').forEach((el) => {
      el.addEventListener('mousemove', () => setActive(Number(el.dataset.i)));
      el.addEventListener('click', () => exec(Number(el.dataset.i)));
    });
  };

  const setActive = (i) => {
    active = i;
    list.querySelectorAll('.palette__item').forEach((el, k) =>
      el.classList.toggle('is-active', k === i));
    list.querySelector('.palette__item.is-active')?.scrollIntoView({ block: 'nearest' });
  };

  const exec = (i) => {
    const cmd = itens[i];
    close();
    cmd?.run();
  };

  function close() {
    aberto = false;
    back.classList.remove('is-open');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => back.remove(), 180);
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(active + 1, itens.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(active - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); exec(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  input.addEventListener('input', () => render(input.value));
  document.addEventListener('keydown', onKey, true);

  document.getElementById('overlay-root').appendChild(back);
  render();
  requestAnimationFrame(() => { back.classList.add('is-open'); input.focus(); });
}

/** Registra o atalho global Ctrl/⌘+K. */
export function initPalette() {
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    }
  });
}
