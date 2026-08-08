/**
 * CMV Pro — Registro de rotas e navegação
 * ---------------------------------------
 * Fonte única das rotas do produto. Cada rota declara:
 *   path    — segmento após '#/'
 *   title   — título exibido na topbar / <title>
 *   icon    — nome do ícone (js/components/icons.js)
 *   group   — agrupamento na sidebar (null = fora da sidebar)
 *   public  — true para telas sem sessão (login, cadastro…)
 *   load    — import dinâmico do módulo da página (lazy loading real:
 *             o código só baixa quando a rota é visitada)
 *
 * Todas as 17 rotas do produto estão implementadas (fases 1–11 do roadmap).
 */

export const ROUTES = [
  /* ------------------------- telas públicas ------------------------- */
  { path: 'login', title: 'Entrar', public: true, load: () => import('../pages/auth.js') },
  { path: 'cadastro', title: 'Criar conta', public: true, load: () => import('../pages/auth.js') },
  { path: 'recuperar', title: 'Recuperar senha', public: true, load: () => import('../pages/auth.js') },

  /* --------------------------- visão geral -------------------------- */
  {
    path: 'dashboard', title: 'Dashboard', icon: 'home', group: 'Visão geral',
    load: () => import('../pages/dashboard.js'),
  },

  /* ---------------------------- catálogo ---------------------------- */
  {
    path: 'ingredientes', title: 'Ingredientes', icon: 'carrot', group: 'Catálogo',
    load: () => import('../pages/ingredientes.js'),
  },
  {
    path: 'categorias', title: 'Categorias', icon: 'tag', group: 'Catálogo',
    load: () => import('../pages/categorias.js'),
  },
  {
    path: 'produtos', title: 'Produtos', icon: 'package', group: 'Catálogo',
    load: () => import('../pages/produtos.js'),
  },
  {
    path: 'fichas', title: 'Fichas Técnicas', icon: 'clipboard', group: 'Catálogo',
    load: () => import('../pages/fichas.js'),
  },

  /* ----------------------------- análise ---------------------------- */
  {
    path: 'cmv', title: 'CMV', icon: 'percent', group: 'Análise',
    load: () => import('../pages/cmv.js'),
  },
  {
    path: 'precificacao', title: 'Precificação', icon: 'coins', group: 'Análise',
    load: () => import('../pages/precificacao.js'),
  },
  {
    path: 'simulador', title: 'Simulador', icon: 'flask', group: 'Análise',
    load: () => import('../pages/simulador.js'),
  },

  /* ---------------------------- operação ---------------------------- */
  {
    path: 'estoque', title: 'Estoque', icon: 'boxes', group: 'Operação',
    load: () => import('../pages/estoque.js'),
  },
  {
    path: 'compras', title: 'Compras', icon: 'cart', group: 'Operação',
    load: () => import('../pages/compras.js'),
  },
  {
    path: 'financeiro', title: 'Financeiro', icon: 'wallet', group: 'Operação',
    load: () => import('../pages/financeiro.js'),
  },
  {
    path: 'relatorios', title: 'Relatórios', icon: 'chart', group: 'Operação',
    load: () => import('../pages/relatorios.js'),
  },

  /* ----------------------------- sistema ---------------------------- */
  {
    path: 'configuracoes', title: 'Configurações', icon: 'settings', group: 'Sistema',
    load: () => import('../pages/configuracoes.js'),
  },
  {
    path: 'usuarios', title: 'Usuários', icon: 'users', group: 'Sistema',
    load: () => import('../pages/usuarios.js'),
  },
  {
    path: 'perfil', title: 'Perfil', icon: 'user', group: 'Sistema',
    load: () => import('../pages/perfil.js'),
  },
  {
    path: 'ajuda', title: 'Ajuda', icon: 'help', group: 'Sistema',
    load: () => import('../pages/ajuda.js'),
  },
];

/** Itens da bottom-nav do mobile (4 rotas + botão Menu). */
export const MOBILE_NAV = ['dashboard', 'ingredientes', 'produtos', 'cmv'];

/** Rota padrão após login. */
export const HOME = 'dashboard';

/** Busca a definição de uma rota pelo path. */
export function findRoute(path) {
  return ROUTES.find((r) => r.path === path) ?? null;
}
