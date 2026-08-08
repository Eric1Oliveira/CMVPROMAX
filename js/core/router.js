/**
 * CMV Pro — Router SPA (hash-based)
 * ---------------------------------
 * Roteamento por hash ('#/dashboard') — funciona em qualquer servidor
 * estático sem configuração de rewrite. Responsabilidades:
 *
 *  - interpretar o hash e resolver a rota (js/core/nav.js);
 *  - proteger rotas privadas (redireciona para #/login sem sessão);
 *  - carregar o módulo da página sob demanda (lazy loading);
 *  - delegar a renderização ao shell (callback registrado pelo main.js).
 *
 * Contrato de página (módulo carregado):
 *   export default {
 *     render(container, ctx) — monta a página; ctx = { route, params, session }
 *     destroy()?            — limpeza opcional ao sair da rota
 *   }
 */

import { findRoute, HOME } from './nav.js';
import { getSession } from './auth.js';

let onRouteChange = null;   // callback do shell (main.js)
let currentPage = null;     // módulo da página ativa (para destroy())
let navigating = false;     // evita renderizações concorrentes

/** Navega programaticamente para uma rota. */
export function navigate(path) {
  location.hash = `#/${path}`;
}

/** Extrai { path, params } do hash atual. Ex.: '#/ingredientes/abc' */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, ...rest] = raw.split('/');
  return { path: path || '', params: rest.filter(Boolean) };
}

/** Resolve e renderiza a rota atual. */
async function handleRoute() {
  if (navigating) return;
  navigating = true;

  try {
    const { path, params } = parseHash();
    const session = getSession();

    // Sem hash: decide o destino inicial pela sessão
    if (!path) {
      navigating = false;
      navigate(session ? HOME : 'login');
      return;
    }

    let route = findRoute(path);

    // Rota desconhecida → dashboard (logado) ou login
    if (!route) {
      navigating = false;
      navigate(session ? HOME : 'login');
      return;
    }

    // Guarda de autenticação
    if (!route.public && !session) {
      navigating = false;
      navigate('login');
      return;
    }
    // Logado tentando abrir tela pública (ex.: login) → vai para o app
    if (route.public && session) {
      navigating = false;
      navigate(HOME);
      return;
    }

    // Limpeza da página anterior (listeners, timers…)
    currentPage?.destroy?.();
    currentPage = null;

    // Lazy load do módulo da página
    const mod = await route.load();
    currentPage = mod.default;

    // Entrega ao shell decidir onde/como montar
    await onRouteChange?.({ route, params, session, page: currentPage });

    // Título do documento acompanha a rota
    document.title = `${route.title} — CMV Pro`;
  } catch (err) {
    console.error('[router] falha ao renderizar rota:', err);
  } finally {
    navigating = false;
  }
}

/** Inicia o router. `handler` é chamado a cada mudança de rota. */
export function startRouter(handler) {
  onRouteChange = handler;
  window.addEventListener('hashchange', handleRoute);
  return handleRoute(); // resolve a rota inicial
}
