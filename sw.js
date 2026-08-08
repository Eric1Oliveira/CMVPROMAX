/**
 * CMV Pro — Service Worker
 * ------------------------
 * Estratégia:
 *  - Pré-cache do "app shell" na instalação (HTML, CSS, JS, ícones).
 *  - Navegações: network-first com fallback para o cache (Offline Ready).
 *  - Assets estáticos: stale-while-revalidate (resposta instantânea do cache,
 *    atualização silenciosa em segundo plano).
 *
 * Ao publicar uma nova versão, incremente VERSION para invalidar caches antigos.
 */

const VERSION = 'v1.9.0';
const CACHE_NAME = `cmvpro-${VERSION}`;

/** Arquivos essenciais para a aplicação abrir offline. */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/pages.css',
  './js/main.js',
  './js/config.js',
  './js/core/events.js',
  './js/core/theme.js',
  './js/core/router.js',
  './js/core/auth.js',
  './js/core/nav.js',
  './js/services/db.js',
  './js/services/db.local.js',
  './js/services/db.supabase.js',
  './js/services/supabase-client.js',
  './js/services/calc.js',
  './js/services/estoque.js',
  './js/services/integracoes.js',
  './js/services/seed.js',
  './js/components/icons.js',
  './js/components/toast.js',
  './js/components/modal.js',
  './js/components/charts.js',
  './js/components/ui.js',
  './js/utils/format.js',
  './js/utils/csv.js',
  './js/utils/exportar.js',
  './js/utils/mask.js',
  './js/utils/uid.js',
  './js/components/combobox.js',
  './js/components/palette.js',
  './js/components/undo.js',
  './js/pages/auth.js',
  './js/pages/dashboard.js',
  './js/pages/ingredientes.js',
  './js/pages/categorias.js',
  './js/pages/produtos.js',
  './js/pages/fichas.js',
  './js/pages/cmv.js',
  './js/pages/precificacao.js',
  './js/pages/simulador.js',
  './js/pages/estoque.js',
  './js/pages/compras.js',
  './js/pages/financeiro.js',
  './js/pages/relatorios.js',
  './js/pages/configuracoes.js',
  './js/pages/usuarios.js',
  './js/pages/perfil.js',
  './js/pages/ajuda.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-maskable.svg'
];

/* Instalação: pré-carrega o app shell no cache.
   cache:'reload' é ESSENCIAL: sem ele, o addAll copia do cache HTTP do
   navegador e uma versão nova pode reinstalar arquivos velhos (o app
   nunca atualiza de verdade). Com ele, tudo vem fresco da rede. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(
        APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))
      ))
      .then(() => self.skipWaiting())
  );
});

/* Ativação: remove caches de versões anteriores. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('cmvpro-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* Interceptação de requisições. */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Apenas GET é cacheável; demais métodos passam direto.
  if (request.method !== 'GET') return;

  // Ignora requisições de outras origens (APIs externas futuras, etc).
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegações (abrir/recarregar a página): rede primeiro, cache como fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached); // offline: devolve o que houver em cache

      return cached || network;
    })
  );
});
