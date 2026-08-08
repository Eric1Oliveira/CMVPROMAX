/**
 * CMV Pro — Combobox (select pesquisável)
 * ---------------------------------------
 * Transforma um <select> comum num campo com busca instantânea, navegação
 * por teclado e opção de "criar novo item" sem sair do formulário. O <select>
 * original continua no DOM (escondido) segurando o valor — então TODO código
 * que faz `.value` ou escuta `change`/`input` continua funcionando igual.
 *
 * Uso:
 *   upgradeSelects(root)                      // auto: selects longos viram busca
 *   upgradeSelect(sel, { onCreate })          // com "criar «texto»" no rodapé
 *
 * onCreate(texto) deve criar a entidade e retornar { id, nome } (ou null).
 */

import { icon } from './icons.js';
import { esc } from '../utils/format.js';

const AUTO_MIN_OPCOES = 7; // abaixo disso, select nativo já é confortável

/** Normaliza para busca sem acento/caixa. */
const norm = (s) => (s ?? '').toString().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Substitui um <select> por um combobox pesquisável.
 * @param {HTMLSelectElement} select
 * @param {{ onCreate?: (texto:string)=>Promise<{id,nome}|null>, placeholder?:string }} opts
 */
export function upgradeSelect(select, { onCreate, placeholder } = {}) {
  if (select.dataset.cbx) return;           // já convertido
  select.dataset.cbx = '1';

  const wrap = document.createElement('div');
  wrap.className = 'cbx';

  const input = document.createElement('input');
  input.className = 'input cbx__input';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-autocomplete', 'list');
  input.autocomplete = 'off';
  input.placeholder = placeholder || select.querySelector('option')?.textContent || 'Selecionar…';

  const panel = document.createElement('div');
  panel.className = 'cbx__panel';
  panel.hidden = true;

  const caret = document.createElement('span');
  caret.className = 'cbx__caret';
  caret.innerHTML = icon('chevron-down', 16);

  // esconde o select nativo mas mantém no fluxo (acessível ao form)
  select.classList.add('cbx__native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.insertAdjacentElement('afterend', wrap);
  wrap.append(input, caret, panel);

  let active = -1;   // índice destacado na lista
  let itens = [];    // opções filtradas correntes

  const opcoes = () =>
    [...select.options].map((o) => ({ value: o.value, label: o.textContent }));

  const displayAtual = () =>
    select.options[select.selectedIndex]?.textContent ?? '';

  const setDisplay = () => { input.value = displayAtual(); };
  setDisplay();

  function abrir() {
    filtrar(input.value === displayAtual() ? '' : input.value);
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    wrap.classList.add('is-open');
  }
  function fechar() {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    wrap.classList.remove('is-open');
    setDisplay(); // descarta texto não confirmado
    active = -1;
  }

  function escolher(value) {
    select.value = value;
    // dispara os dois eventos: código legado escuta ora 'change', ora 'input'
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));
    fechar();
  }

  function filtrar(q) {
    const nq = norm(q);
    itens = opcoes().filter((o) => norm(o.label).includes(nq));
    const exato = opcoes().some((o) => norm(o.label) === nq);
    const podeCriar = onCreate && q.trim() && !exato;

    panel.innerHTML = itens.map((o, i) => `
      <div class="cbx__opt ${o.value === select.value ? 'is-selected' : ''}"
        data-val="${esc(o.value)}" data-i="${i}" role="option">
        ${esc(o.label)}
        ${o.value === select.value ? icon('check', 15) : ''}
      </div>`).join('') || (podeCriar ? '' : `<div class="cbx__empty">Nada encontrado</div>`);

    if (podeCriar) {
      panel.insertAdjacentHTML('beforeend', `
        <button type="button" class="cbx__create" data-create>
          ${icon('plus', 15)} Criar “${esc(q.trim())}”
        </button>`);
    }
    active = itens.length ? 0 : -1;
    marcar();

    panel.querySelectorAll('.cbx__opt').forEach((el) =>
      el.addEventListener('mousedown', (e) => { e.preventDefault(); escolher(el.dataset.val); }));

    panel.querySelector('[data-create]')?.addEventListener('mousedown', async (e) => {
      e.preventDefault();
      await criar(input.value.trim());
    });
  }

  function marcar() {
    panel.querySelectorAll('.cbx__opt').forEach((el, i) =>
      el.classList.toggle('is-active', i === active));
    panel.querySelector('.cbx__opt.is-active')?.scrollIntoView({ block: 'nearest' });
  }

  async function criar(texto) {
    if (!onCreate || !texto) return;
    try {
      const novo = await onCreate(texto);
      if (novo?.id) {
        const opt = new Option(novo.nome, novo.id, true, true);
        select.add(opt);
        escolher(novo.id);
      }
    } catch (err) {
      console.error('[cbx] criar falhou:', err);
    }
  }

  input.addEventListener('focus', abrir);
  input.addEventListener('click', abrir);
  input.addEventListener('input', () => { if (panel.hidden) abrir(); else filtrar(input.value); });
  caret.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (panel.hidden) input.focus(); else fechar();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (panel.hidden) return abrir(); active = Math.min(active + 1, itens.length - 1); marcar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); marcar(); }
    else if (e.key === 'Enter') {
      if (panel.hidden) return;
      e.preventDefault();
      const createBtn = panel.querySelector('[data-create]');
      if (active >= 0 && itens[active]) escolher(itens[active].value);
      else if (createBtn) criar(input.value.trim());
    }
    else if (e.key === 'Escape') { if (!panel.hidden) { e.stopPropagation(); fechar(); } }
  });

  // clique fora fecha; o listener se remove sozinho quando o combobox some
  const onDocDown = (e) => {
    if (!wrap.isConnected) { document.removeEventListener('mousedown', onDocDown); return; }
    if (!wrap.contains(e.target)) fechar();
  };
  document.addEventListener('mousedown', onDocDown);
}

/**
 * Converte automaticamente os selects "longos" de um container.
 * Pula: poucos itens, [data-nosearch] e [data-create] (a página cuida).
 */
export function upgradeSelects(root) {
  root.querySelectorAll('select').forEach((sel) => {
    if (sel.dataset.cbx || sel.dataset.nosearch !== undefined || sel.dataset.create !== undefined) return;
    if (sel.dataset.search !== undefined || sel.options.length >= AUTO_MIN_OPCOES) {
      upgradeSelect(sel);
    }
  });
}
