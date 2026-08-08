# CMV Pro

O sistema mais intuitivo para **cálculo de CMV, ficha técnica, precificação,
rentabilidade e gestão financeira** de restaurantes, hamburguerias, pizzarias,
cafeterias, bares, adegas, padarias, confeitarias e cozinhas industriais.

100% **HTML5 + CSS3 + JavaScript** (ES Modules) — sem frameworks, sem build,
sem dependências. PWA, offline-ready, dark/light mode, mobile-first.

---

## Como rodar

O app usa ES Modules e Service Worker, então precisa de um servidor local
(não funciona abrindo o `index.html` direto do disco):

```bash
# Opção 1 — VS Code: extensão "Live Server" → Open with Live Server
# Opção 2 — Node:
npx serve .
# Opção 3 — Python:
python -m http.server 8080
```

Abra `http://localhost:8080` (ou a porta indicada).

**Conta demo (modo local):** na tela de login, clique em **"Explorar com conta
demo"** — o app entra com dados realistas de uma hamburgueria (ingredientes,
fichas técnicas, 8 semanas de vendas, alertas disparados).

Credenciais demo: `demo@cmvpro.app` / `demo1234`.

---

## Conectar ao Supabase (produção)

O app roda em **dois modos** com o mesmo código: local (localStorage, para
desenvolvimento/demo) e **Supabase** (Postgres + Auth reais, multiempresa).

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor → New query**, cole o conteúdo de
   [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
   Isso cria todas as tabelas, o isolamento por empresa (RLS) e o trigger
   que provisiona empresa + perfil a cada cadastro.
3. Em **Settings → API**, copie a *Project URL* e a chave *anon public*.
4. Preencha as duas constantes em [`js/config.js`](js/config.js) e recarregue.

Pronto: cadastro/login passam a usar o Supabase Auth (com confirmação e
recuperação de senha por e-mail) e todos os dados vão para o Postgres com
Row Level Security — cada usuário enxerga apenas a própria empresa.

> A chave `anon` é pública por design; a segurança vem das políticas RLS.

---

## Arquitetura

```
cmv/
├── index.html               # App shell + splash (única página — SPA)
├── manifest.webmanifest     # PWA
├── sw.js                    # Service Worker (offline: cache do app shell)
├── assets/
│   └── icons/               # Ícones do PWA (SVG)
├── css/                     # Ordem de carga: tokens → base → layout → components → pages
│   ├── tokens.css           # Design system: cores (light/dark), tipografia, espaçamento…
│   ├── base.css             # Reset, acessibilidade, utilitários
│   ├── layout.css           # Shell: sidebar, topbar, bottom-nav, FAB, auth
│   ├── components.css       # Botões, inputs, cards, tabelas, modais, toasts, skeletons…
│   └── pages.css            # Ajustes específicos por página
└── js/
    ├── main.js              # Bootstrap + shell da aplicação
    ├── core/
    │   ├── events.js        # Pub/sub (bus)
    │   ├── theme.js         # Dark/Light/Auto + preferência do SO
    │   ├── router.js        # Router SPA por hash, com guardas de sessão
    │   ├── nav.js           # Registro único de rotas (lazy loading por rota)
    │   └── auth.js          # Autenticação (contrato igual a Supabase/JWT)
    ├── services/
    │   ├── db.js            # Repositório (localStorage; API async pronta p/ backend)
    │   ├── calc.js          # Motor de CMV: custos, margens, preços sugeridos, alertas
    │   └── seed.js          # Dados de demonstração determinísticos
    ├── components/
    │   ├── icons.js         # Ícones SVG inline (currentColor)
    │   ├── toast.js         # Feedback de ações
    │   ├── modal.js         # Modal/sheet + diálogo de confirmação
    │   ├── charts.js        # Gráficos SVG (linha, colunas, sparkline) sem libs
    │   └── ui.js            # KPI cards, empty states, skeletons, page head…
    ├── utils/
    │   ├── format.js        # Moeda/número/data pt-BR, unidades e conversões
    │   └── csv.js           # Import/export CSV compatível com Excel BR
    └── pages/               # Um módulo por rota (lazy-loaded)
        ├── auth.js          # Login, cadastro e recuperação de senha
        ├── dashboard.js     # KPIs, gráficos, alertas, rankings
        ├── ingredientes.js  # CRUD + CSV + histórico de preços
        ├── categorias.js    # Categorias com cor e contagem
        ├── produtos.js      # Preços por canal, CMV/margem ao vivo
        ├── fichas.js        # Editor de ficha técnica + versões
        ├── cmv.js           # Análise de CMV por canal + export
        ├── precificacao.js  # Preços sugeridos + aplicar com 1 clique
        ├── simulador.js     # Cenários: insumo, canais, margem alvo
        ├── estoque.js       # Movimentos, inventário, sugestão de compra
        ├── compras.js       # Pedidos: rascunho → enviado → recebido
        ├── financeiro.js    # Vendas (baixa automática), despesas, fluxo
        ├── relatorios.js    # 6 relatórios: CSV / Excel / PDF
        ├── configuracoes.js # Empresa, metas, canais, backup, integrações
        ├── usuarios.js      # Membros da empresa (multiusuário)
        ├── perfil.js        # Nome, senha, preferências
        └── ajuda.js         # Primeiros passos e conceitos
```

### Decisões de arquitetura

- **Camada de dados assíncrona** (`services/db.js`): todas as operações
  retornam Promises, espelhando um backend real. Migrar para **Supabase /
  API REST** = reimplementar apenas esse arquivo.
- **Autenticação com contrato JWT-ready** (`core/auth.js`): `signUp`,
  `signIn`, `signOut`, sessão com expiração. Senhas com hash SHA-256 + salt.
- **Lazy loading real**: cada página é um módulo carregado via `import()`
  somente quando a rota é visitada.
- **Eventos desacoplados**: mutações no banco emitem `db:changed`; as telas
  abertas se re-renderizam sozinhas.
- **Design tokens**: nenhuma cor/sombra/raio "solto" — tudo em
  `css/tokens.css`, com temas claro/escuro completos.
- **Gráficos SVG próprios** com paleta categórica validada para daltonismo e
  contraste (relatório do validador no histórico do projeto).

---

## Roadmap por fases

| Fase | Escopo | Status |
|------|--------|--------|
| 1 | Arquitetura + design system | ✅ Entregue |
| 2 | Shell, componentes, tema, PWA | ✅ Entregue |
| 3 | Autenticação (login/cadastro/recuperar) | ✅ Entregue |
| 4 | Dashboard (KPIs, gráficos, alertas, rankings) | ✅ Entregue |
| 5 | Ingredientes (CRUD, CSV, histórico de preços) | ✅ Entregue |
| 5.5 | Supabase (schema SQL, RLS multiempresa, Auth real) | ✅ Entregue |
| 6 | Categorias + Produtos (preços por canal) | ✅ Entregue |
| 7 | Fichas técnicas (editor, custo ao vivo, versões, duplicar) | ✅ Entregue |
| 8 | CMV + Precificação + Simulador | ✅ Entregue |
| 9 | Estoque + Compras (movimentos, inventário, sugestão → pedido, receber) | ✅ Entregue |
| 10 | Financeiro (vendas c/ baixa de estoque, fluxo de caixa, metas) + Relatórios (CSV/Excel/PDF) + arquitetura de integrações | ✅ Entregue |
| 11 | Sistema: Configurações, Usuários, Perfil, Ajuda | ✅ Entregue |

**Roadmap concluído** — todas as 17 telas do produto estão implementadas.

As rotas das fases futuras já existem no app (menu lateral) e mostram o
escopo planejado de cada módulo.
