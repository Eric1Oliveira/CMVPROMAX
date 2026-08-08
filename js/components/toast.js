/**
 * CMV Pro — Toasts
 * ----------------
 * Feedback não bloqueante para toda ação do usuário.
 *
 * Uso:
 *   toast.success('Ingrediente salvo');
 *   toast.error('Não foi possível salvar', 'Tente novamente.');
 */

import { icon } from './icons.js';
import { esc } from '../utils/format.js';

const DURATION_MS = 3800;
const DURATION_ACTION_MS = 6000; // mais tempo quando há botão (ex.: Desfazer)
let stack = null;

/** Garante o contêiner (portal) dos toasts no overlay-root. */
function ensureStack() {
  if (stack) return stack;
  stack = document.createElement('div');
  stack.className = 'toast-stack';
  stack.setAttribute('role', 'status');
  stack.setAttribute('aria-live', 'polite');
  document.getElementById('overlay-root').appendChild(stack);
  return stack;
}

const ICONS = {
  success: 'check-circle',
  error: 'alert-circle',
  warning: 'alert-triangle',
  info: 'info',
};

/** Cria e exibe um toast; remove-se sozinho após o tempo. */
function show(type, title, message = '', action = null) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `
    <span class="toast__icon">${icon(ICONS[type], 20)}</span>
    <div style="flex:1;min-width:0">
      <div class="toast__title">${esc(title)}</div>
      ${message ? `<div class="toast__msg">${esc(message)}</div>` : ''}
    </div>
    ${action ? `<button class="toast__action">${esc(action.label)}</button>` : ''}
  `;

  if (action) {
    el.querySelector('.toast__action').addEventListener('click', (e) => {
      e.stopPropagation();
      action.onAction?.();
      dismiss(el);
    });
  }

  // Clique no corpo dispensa (o botão de ação tem stopPropagation)
  el.addEventListener('click', () => dismiss(el));
  ensureStack().appendChild(el);

  el._timer = setTimeout(() => dismiss(el), action ? DURATION_ACTION_MS : DURATION_MS);
  return el;
}

/** Remove com animação de saída. */
function dismiss(el) {
  if (!el.isConnected) return;
  clearTimeout(el._timer);
  el.classList.add('is-leaving');
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

export const toast = {
  success: (title, msg) => show('success', title, msg),
  error: (title, msg) => show('error', title, msg),
  warning: (title, msg) => show('warning', title, msg),
  info: (title, msg) => show('info', title, msg),
  /** Toast com botão de ação, ex.: toast.action('success','Excluído','',{label:'Desfazer',onAction}) */
  action: (type, title, msg, action) => show(type, title, msg, action),
};
