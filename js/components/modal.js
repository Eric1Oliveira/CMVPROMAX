/**
 * CMV Pro — Modal / Sheet
 * -----------------------
 * No mobile abre como bottom-sheet; no desktop como modal centralizado
 * (comportamento definido no CSS). Gerencia foco, Esc e clique no backdrop.
 *
 * Uso:
 *   const m = openModal({ title: 'Novo ingrediente', content: nodeOuHtml,
 *                         footer: nodeOuHtml, size: 'lg' });
 *   m.close();
 *
 *   confirmDialog({ title, message, confirmLabel, danger }) → Promise<boolean>
 */

import { icon } from './icons.js';
import { esc } from '../utils/format.js';
import { applyMasks } from '../utils/mask.js';
import { upgradeSelects } from './combobox.js';

/**
 * Abre um modal genérico.
 * @returns {{ el: HTMLElement, body: HTMLElement, close: Function }}
 */
export function openModal({ title, content, footer, size = '', onClose } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${size ? `modal--${size}` : ''}" role="dialog" aria-modal="true" aria-label="${esc(title ?? 'Diálogo')}">
      <div class="modal__head">
        <h2>${esc(title ?? '')}</h2>
        <button class="icon-btn" data-close aria-label="Fechar">${icon('x', 18)}</button>
      </div>
      <div class="modal__body"></div>
      ${footer !== undefined ? '<div class="modal__footer"></div>' : ''}
    </div>
  `;

  const body = backdrop.querySelector('.modal__body');
  if (typeof content === 'string') body.innerHTML = content;
  else if (content) body.appendChild(content);

  if (footer !== undefined) {
    const foot = backdrop.querySelector('.modal__footer');
    if (typeof footer === 'string') foot.innerHTML = footer;
    else if (footer) foot.appendChild(footer);
  }

  const previouslyFocused = document.activeElement;

  function close(result) {
    backdrop.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    // aguarda a transição de saída antes de remover do DOM
    setTimeout(() => backdrop.remove(), 220);
    previouslyFocused?.focus?.();
    onClose?.(result);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close(); // clique fora fecha
  });
  backdrop.querySelector('[data-close]').addEventListener('click', () => close());
  document.addEventListener('keydown', onKey);

  // Facilitadores automáticos: máscaras de digitação, selects pesquisáveis
  // e Enter para confirmar — todo modal do app ganha isso de graça.
  applyMasks(body);
  upgradeSelects(body);

  // Enter em qualquer campo (menos textarea) aciona a ação primária do rodapé
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
    if (e.target.getAttribute('role') === 'combobox') return; // Enter é do combobox
    const primary = backdrop.querySelector('.modal__footer .btn--primary, .modal__footer .btn--danger');
    if (primary) { e.preventDefault(); primary.click(); }
  });

  document.getElementById('overlay-root').appendChild(backdrop);
  // força reflow para a transição de entrada disparar
  requestAnimationFrame(() => backdrop.classList.add('is-open'));

  // foco inicial no primeiro campo (ou no botão fechar)
  setTimeout(() => {
    (body.querySelector('input, select, textarea, button') ??
      backdrop.querySelector('[data-close]')).focus();
  }, 60);

  return { el: backdrop, body, close };
}

/**
 * Diálogo de confirmação. Resolve true (confirmou) ou false.
 */
export function confirmDialog({
  title = 'Tem certeza?',
  message = '',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const footer = document.createElement('div');
    footer.style.display = 'contents';
    footer.innerHTML = `
      <button class="btn btn--secondary" data-cancel>${esc(cancelLabel)}</button>
      <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-ok>${esc(confirmLabel)}</button>
    `;

    const m = openModal({
      title,
      content: `<p class="text-2">${esc(message)}</p>`,
      footer,
      onClose: (result) => resolve(result === true),
    });

    footer.querySelector('[data-cancel]').addEventListener('click', () => m.close(false));
    footer.querySelector('[data-ok]').addEventListener('click', () => m.close(true));
  });
}
