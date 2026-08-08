/**
 * CMV Pro — Bootstrap e Shell da aplicação
 * ----------------------------------------
 * Responsabilidades:
 *  1. Inicializar tema, service worker e router.
 *  2. Renderizar o shell correto por rota:
 *     - telas públicas (login/cadastro/recuperar) → tela cheia;
 *     - telas privadas → shell com sidebar, topbar, bottom-nav e FAB.
 *  3. Estados globais: indicador de rota ativa, busca global.
 */

import { initTheme, toggleTheme, resolvedTheme } from './core/theme.js';
import { startRouter, navigate } from './core/router.js';
import { ROUTES, MOBILE_NAV, HOME, findRoute } from './core/nav.js';
import { auth, initAuth } from './core/auth.js';
import { db, warm } from './services/db.js';
import { ensureSeed } from './services/seed.js';
import { icon } from './components/icons.js';
import { toast } from './components/toast.js';
import { openModal } from './components/modal.js';
import { btnLoading } from './components/ui.js';
import { initPalette, openPalette } from './components/palette.js';
import { esc, initials } from './utils/format.js';
import { bus } from './core/events.js';

/** Versão do build — aparece no console para diagnóstico de cache. */
export const APP_VERSION = '1.9.0';
console.info(`[CMV Pro] build v${APP_VERSION}`);

const app = document.getElementById('app');

/** Referências do shell privado (montado uma única vez por sessão). */
let shell = null;

/* ========================================================================
   Sidebar / navegação
   ===================================================================== */

/** HTML dos grupos e itens da sidebar a partir do registro de rotas. */
function sidebarNavHtml() {
  const groups = [];
  for (const route of ROUTES) {
    if (!route.group) continue;
    let g = groups.find((x) => x.name === route.group);
    if (!g) groups.push((g = { name: route.group, items: [] }));
    g.items.push(route);
  }
  return groups.map((g) => `
    <div class="sidebar__group">${esc(g.name)}</div>
    ${g.items.map((r) => `
      <a class="nav-item" href="#/${r.path}" data-nav="${r.path}">
        ${icon(r.icon, 19)}<span>${esc(r.title)}</span>
      </a>`).join('')}
  `).join('');
}

/** Logomarca compartilhada entre telas. */
export function logoHtml(size = 30) {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="12" fill="var(--primary)"/>
      <path d="M31 17.5a8.5 8.5 0 1 0 0 13" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
      <circle cx="33.5" cy="24" r="2.5" fill="#93C5FD"/>
    </svg>`;
}

/**
 * Injeta o nome da coluna em cada célula (data-label) para o modo cartão do
 * mobile — o CSS mostra esse rótulo à esquerda de cada valor. Lê os <th> do
 * cabeçalho e carimba os <td> correspondentes. Idempotente.
 */
function stampTableLabels(root) {
  root.querySelectorAll('table.table').forEach((t) => {
    const headers = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!headers.length) return;
    t.querySelectorAll('tbody tr').forEach((tr) => {
      let i = 0;
      for (const td of tr.children) {
        if (td.hasAttribute('colspan')) { i += Number(td.getAttribute('colspan')) || 1; continue; }
        if (headers[i] && !td.dataset.label) td.dataset.label = headers[i];
        i += 1;
      }
    });
  });
}

/** Monta o shell privado (uma vez) e devolve as referências. */
function buildAppShell(session) {
  app.innerHTML = `
    <a class="skip-link" href="#page">Pular para o conteúdo</a>
    <div class="app-shell">
      <div class="sidebar-scrim" data-scrim></div>

      <aside class="sidebar" data-sidebar aria-label="Navegação principal">
        <div class="sidebar__brand">${logoHtml()}<span>CMV Pro</span></div>
        <nav class="sidebar__nav">${sidebarNavHtml()}</nav>
        <div class="sidebar__footer">
          <div class="entity">
            <div class="entity__avatar" style="background:var(--primary-soft);color:var(--primary)">
              ${esc(initials(session.name))}
            </div>
            <div style="flex:1;min-width:0">
              <div class="entity__name truncate">${esc(session.name)}</div>
              <div class="entity__meta truncate">${esc(session.email)}</div>
            </div>
            <button class="icon-btn" data-logout title="Sair" aria-label="Sair da conta">
              ${icon('logout', 18)}
            </button>
          </div>
        </div>
      </aside>

      <div class="app-main">
        <header class="topbar">
          <h1 class="topbar__title truncate" data-title></h1>
          <label class="topbar__search">
            ${icon('search', 17)}
            <input type="search" placeholder="Buscar ingredientes, produtos…"
              aria-label="Busca global" data-global-search />
            <kbd style="font-size:11px;color:var(--text-3);border:1px solid var(--border);border-radius:5px;padding:1px 5px">/</kbd>
          </label>
          <div class="topbar__actions">
            <button class="icon-btn" data-palette title="Ações rápidas (Ctrl+K)"
              aria-label="Abrir ações rápidas">${icon('search', 19)}</button>
            <button class="icon-btn" data-theme-toggle title="Alternar tema"
              aria-label="Alternar entre tema claro e escuro"></button>
          </div>
        </header>

        <main class="app-content" id="page" data-page tabindex="-1"></main>
      </div>

      <nav class="bottom-nav" aria-label="Navegação inferior">
        ${(() => {
          const link = (path) => {
            const r = findRoute(path);
            return `
              <a class="bottom-nav__item" href="#/${r.path}" data-bnav="${r.path}">
                ${icon(r.icon, 21)}<span>${esc(r.title)}</span>
              </a>`;
          };
          // 2 atalhos · botão "+" central elevado (abre o HUD) · 2 atalhos
          return link(MOBILE_NAV[0]) + link(MOBILE_NAV[1]) + `
            <button class="bottom-nav__launcher" data-hud aria-label="Abrir atalhos" aria-expanded="false">
              <span class="bottom-nav__plus">${icon('plus', 26)}</span>
            </button>` + link(MOBILE_NAV[2]) + link(MOBILE_NAV[3]);
        })()}
      </nav>

      <button class="fab" data-fab hidden aria-label="">${icon('plus', 24)}</button>
    </div>
  `;

  const refs = {
    root: app.querySelector('.app-shell'),
    sidebar: app.querySelector('[data-sidebar]'),
    scrim: app.querySelector('[data-scrim]'),
    title: app.querySelector('[data-title]'),
    page: app.querySelector('[data-page]'),
    fab: app.querySelector('[data-fab]'),
    themeBtn: app.querySelector('[data-theme-toggle]'),
    search: app.querySelector('[data-global-search]'),
  };

  /* --- HUD de atalhos (mobile): substitui o menu lateral ---
     No celular, o botão "+" central da barra inferior abre uma folha com
     todas as seções em grade. Sem drawer lateral. */
  app.querySelector('[data-hud]').addEventListener('click', () => openHud(session));

  /* --- rótulos de tabela p/ o modo cartão do mobile ---
     Observa o conteúdo e recarimba a cada re-render de página. */
  let tblRaf = 0;
  const tblObserver = new MutationObserver(() => {
    cancelAnimationFrame(tblRaf);
    tblRaf = requestAnimationFrame(() => stampTableLabels(refs.page));
  });
  tblObserver.observe(refs.page, { childList: true, subtree: true });

  /* --- tema --- */
  const paintThemeBtn = () => {
    refs.themeBtn.innerHTML = icon(resolvedTheme() === 'dark' ? 'sun' : 'moon', 19);
  };
  paintThemeBtn();
  refs.themeBtn.addEventListener('click', toggleTheme);
  bus.on('theme:changed', paintThemeBtn);

  /* --- ações rápidas (command palette) --- */
  app.querySelector('[data-palette]').addEventListener('click', openPalette);

  /* --- logout --- */
  app.querySelector('[data-logout]').addEventListener('click', async () => {
    await auth.signOut();
    shell = null;
    toast.info('Sessão encerrada', 'Até logo!');
    navigate('login');
  });

  /* --- busca global: '/' foca; Enter leva à lista com o termo --- */
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName ?? '')) {
      e.preventDefault();
      refs.search?.focus();
    }
  });
  refs.search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && refs.search.value.trim()) {
      sessionStorage.setItem('cmvpro:search', refs.search.value.trim());
      refs.search.value = '';
      navigate('ingredientes');
      bus.emit('global-search');
    }
  });

  /* Nota: o app continua offline-ready (service worker + dados locais);
     apenas não exibe banner de status de rede — a detecção do navegador
     (navigator.onLine) é falso-positiva em máquinas com adaptadores
     virtuais e o aviso causava mais confusão do que ajuda. */

  return refs;
}

/* ========================================================================
   HUD de atalhos (mobile) — abre com o "+" central da barra inferior
   ===================================================================== */

let hudAberto = false;

function openHud(session) {
  if (hudAberto) return;
  hudAberto = true;

  const launcher = app.querySelector('[data-hud]');
  launcher?.setAttribute('aria-expanded', 'true');
  launcher?.classList.add('is-open');

  // agrupa as rotas por seção (rotas sem grupo caem em "Conta")
  const grupos = [];
  for (const r of ROUTES) {
    if (r.public) continue;
    const nome = r.group || 'Conta';
    let g = grupos.find((x) => x.nome === nome);
    if (!g) grupos.push((g = { nome, itens: [] }));
    g.itens.push(r);
  }
  const ativa = location.hash.replace(/^#\/?/, '').split('/')[0];

  const back = document.createElement('div');
  back.className = 'hud-back';
  back.innerHTML = `
    <div class="hud" role="dialog" aria-modal="true" aria-label="Atalhos de navegação">
      <div class="hud__handle"></div>
      <div class="hud__head">
        <div class="entity" style="flex:1;min-width:0">
          <div class="entity__avatar" style="background:var(--primary-soft);color:var(--primary)">
            ${esc(initials(session?.name ?? ''))}
          </div>
          <div style="min-width:0">
            <div class="entity__name truncate">${esc(session?.name ?? '')}</div>
            <div class="entity__meta truncate">${esc(session?.email ?? '')}</div>
          </div>
        </div>
        <button class="icon-btn" data-close aria-label="Fechar">${icon('x', 20)}</button>
      </div>
      <div class="hud__scroll">
        ${grupos.map((g) => `
          <div class="hud__group">${esc(g.nome)}</div>
          <div class="hud__grid">
            ${g.itens.map((r) => `
              <a class="hud__tile ${ativa === r.path ? 'is-active' : ''}" href="#/${r.path}" data-tile>
                <span class="hud__ico">${icon(r.icon, 22)}</span>
                <span class="hud__label">${esc(r.title)}</span>
              </a>`).join('')}
          </div>`).join('')}
        <button class="hud__logout" data-logout>${icon('logout', 18)} Sair da conta</button>
      </div>
    </div>`;

  function close() {
    hudAberto = false;
    back.classList.remove('is-open');
    launcher?.setAttribute('aria-expanded', 'false');
    launcher?.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => back.remove(), 220);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  back.addEventListener('click', (e) => {
    if (e.target === back) return close();          // toca no fundo
    if (e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-tile]')) return close(); // navega e fecha
  });
  back.querySelector('[data-logout]').addEventListener('click', async () => {
    close();
    await auth.signOut();
    shell = null;
    toast.info('Sessão encerrada', 'Até logo!');
    navigate('login');
  });
  document.addEventListener('keydown', onKey);

  document.getElementById('overlay-root').appendChild(back);
  requestAnimationFrame(() => back.classList.add('is-open'));
}

/* ========================================================================
   Integração router ⇄ shell
   ===================================================================== */

async function onRoute({ route, params, session, page }) {
  /* Telas públicas: tela cheia, sem shell */
  if (route.public) {
    shell = null;
    app.innerHTML = '';
    await page.render(app, { route, params });
    revealApp();
    return;
  }

  /* Sessão sem empresa vinculada (conta anterior ao schema do Supabase e
     auto-provisionamento bloqueado): orienta o reparo em vez de renderizar
     um app vazio. */
  if (!session.empresaId) {
    shell = null;
    app.innerHTML = `
      <div class="auth-shell">
        <div class="auth-card anim-in" style="max-width:520px">
          <div class="auth-card__brand">${logoHtml(34)} CMV Pro</div>
          <h1>Conta sem empresa vinculada</h1>
          <p class="auth-card__subtitle">
            Sua conta foi criada antes do banco de dados ser configurado.
            A correção leva um minuto:
          </p>
          <ol style="display:flex;flex-direction:column;gap:var(--sp-3);padding-left:var(--sp-5);margin-bottom:var(--sp-6)">
            <li>Abra o painel do <strong>Supabase</strong> → <strong>SQL Editor</strong> → New query;</li>
            <li>Cole o conteúdo de <code>supabase/fix-perfis.sql</code> e clique em <strong>Run</strong>;</li>
            <li>Volte aqui e clique em <strong>Recarregar</strong>.</li>
          </ol>
          <div style="display:flex;gap:var(--sp-2)">
            <button class="btn btn--primary btn--full" data-reload>Recarregar</button>
            <button class="btn btn--secondary" data-sair>Sair</button>
          </div>
        </div>
      </div>`;
    app.querySelector('[data-reload]').addEventListener('click', () => location.reload());
    app.querySelector('[data-sair]').addEventListener('click', async () => {
      await auth.signOut();
      navigate('login');
      location.reload();
    });
    revealApp();
    return;
  }

  /* Primeira visita autenticada: garante dados demo para o produto nascer vivo */
  const seeded = await ensureSeed();
  if (seeded) {
    toast.info('Dados de demonstração carregados', 'Explore à vontade — tudo pode ser editado.');
  }

  /* Shell privado é montado uma única vez e reaproveitado entre rotas */
  if (!shell) shell = buildAppShell(session);

  // Título e navegação ativa
  shell.title.textContent = route.title;
  app.querySelectorAll('[data-nav]').forEach((a) =>
    a.classList.toggle('is-active', a.dataset.nav === route.path));
  app.querySelectorAll('[data-bnav]').forEach((a) =>
    a.classList.toggle('is-active', a.dataset.bnav === route.path));

  // FAB: cada página decide se usa (via ctx.setFab)
  shell.fab.hidden = true;
  shell.fab.onclick = null;
  const setFab = ({ label, onClick }) => {
    shell.fab.hidden = false;
    shell.fab.setAttribute('aria-label', label);
    shell.fab.title = label;
    shell.fab.onclick = onClick;
  };

  // Renderiza a página no contêiner de conteúdo
  shell.page.innerHTML = '';
  shell.page.scrollTop = 0;
  await page.render(shell.page, { route, params, session, setFab });

  // Acessibilidade: foco vai para o conteúdo ao trocar de rota
  shell.page.focus({ preventScroll: true });

  revealApp();

  // Após a 1ª tela aparecer, aquece o cache e pré-carrega os módulos das
  // demais páginas em segundo plano — as próximas trocas de tela ficam
  // instantâneas (sem nova ida ao servidor nem download de módulo).
  prefetchTudo();
}

/** Pré-carrega dados e código das outras telas (uma vez, sem bloquear a UI). */
let prefetched = false;
function prefetchTudo() {
  if (prefetched) return;
  prefetched = true;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  idle(() => {
    // 1) aquece o cache de dados das coleções mais usadas
    warm(['ingredientes', 'produtos', 'categorias', 'fornecedores',
          'vendas', 'despesas', 'movimentos', 'compras', 'fichaVersoes']);
    db.getSettings();
    // 2) baixa antecipadamente o JS de cada página do menu
    ROUTES.filter((r) => !r.public && r.load).forEach((r) => r.load().catch(() => {}));
  });
}

/** Remove o splash na primeira renderização completa. */
let revealed = false;
function revealApp() {
  if (revealed) return;
  revealed = true;
  app.hidden = false;
  const splash = document.getElementById('splash');
  splash?.classList.add('is-leaving');
  setTimeout(() => splash?.remove(), 350);
}

/* ========================================================================
   Inicialização
   ===================================================================== */

initTheme();

// Service worker: apenas em http(s) — file:// não suporta.
// A query ?v= muda a URL a cada versão do app: garante que o navegador
// baixe o sw.js novo da rede (nunca do cache HTTP).
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register(`./sw.js?v=${APP_VERSION}`).catch((err) => {
    console.warn('[sw] registro falhou:', err);
  });

  // Quando uma NOVA versão do app assume o controle, recarrega uma única vez
  // para o usuário nunca rodar código velho do cache. O guard `hadController`
  // evita recarregar na primeira instalação (quando não havia SW antes).
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
}

/* Link de recuperação de senha (Supabase): abre modal para definir a nova */
bus.on('auth:recovery', () => {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="field">
      <label class="field__label">Nova senha</label>
      <input class="input" type="password" data-np placeholder="Mínimo de 8 caracteres" autocomplete="new-password" />
      <span class="field__error" role="alert"></span>
    </div>`;
  const footer = document.createElement('div');
  footer.style.display = 'contents';
  footer.innerHTML = `<button class="btn btn--primary" data-ok>Salvar nova senha</button>`;

  const m = openModal({ title: 'Definir nova senha', content, footer });
  footer.querySelector('[data-ok]').addEventListener('click', async (e) => {
    const input = content.querySelector('[data-np]');
    const fieldEl = input.closest('.field');
    if (input.value.length < 8) {
      fieldEl.classList.add('has-error');
      fieldEl.querySelector('.field__error').textContent = 'A senha precisa de pelo menos 8 caracteres.';
      return;
    }
    const restore = btnLoading(e.currentTarget);
    try {
      await auth.completeRecovery(input.value);
      m.close();
      toast.success('Senha atualizada', 'Você já está conectado.');
      navigate(HOME);
    } catch (err) {
      restore();
      toast.error('Não foi possível salvar', err.message);
    }
  });
});

// Atalho global de ações rápidas (Ctrl/⌘+K)
initPalette();

// Restaura a sessão (Supabase ou local) ANTES de resolver a primeira rota.
await initAuth();
startRouter(onRoute);
