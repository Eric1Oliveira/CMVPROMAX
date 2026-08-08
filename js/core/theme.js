/**
 * CMV Pro — Gerenciador de tema (Dark / Light / Auto)
 * ---------------------------------------------------
 * - Preferência persistida em localStorage ('cmvpro:theme').
 * - 'auto' acompanha a preferência do sistema operacional em tempo real.
 * - O tema resolvido é aplicado como [data-theme] no <html>; um script inline
 *   no index.html aplica o mesmo valor antes da primeira pintura (sem flash).
 */

import { bus } from './events.js';

const STORAGE_KEY = 'cmvpro:theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

/** Lê a preferência salva: 'light' | 'dark' | 'auto'. */
export function getThemePref() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'auto';
  } catch {
    return 'auto';
  }
}

/** Resolve a preferência em um tema concreto ('light' | 'dark'). */
export function resolvedTheme() {
  const pref = getThemePref();
  if (pref === 'auto') return media.matches ? 'dark' : 'light';
  return pref;
}

/** Aplica o tema resolvido no documento e notifica interessados. */
function apply() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  bus.emit('theme:changed', { theme, pref: getThemePref() });
}

/** Define a preferência do usuário e aplica imediatamente. */
export function setThemePref(pref) {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch { /* armazenamento indisponível: aplica só em memória */ }
  apply();
}

/** Alterna entre claro e escuro (a partir do tema resolvido atual). */
export function toggleTheme() {
  setThemePref(resolvedTheme() === 'dark' ? 'light' : 'dark');
}

/** Inicializa: aplica tema salvo e observa mudanças do sistema no modo auto. */
export function initTheme() {
  apply();
  media.addEventListener('change', () => {
    if (getThemePref() === 'auto') apply();
  });
}
