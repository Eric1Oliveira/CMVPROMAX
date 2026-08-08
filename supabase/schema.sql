-- ============================================================================
-- CMV Pro — Schema completo do Supabase
-- ----------------------------------------------------------------------------
-- COMO USAR:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Cole este arquivo inteiro e clique em RUN
--   3. Copie a URL do projeto e a chave "anon public"
--      (Settings → API) e preencha js/config.js no app
--
-- ARQUITETURA:
--   - Multiempresa: cada usuário pertence a uma empresa (profiles.empresaId);
--     TODA linha de dados carrega "empresaId" e o RLS garante o isolamento.
--   - Ao criar conta (auth.users), um trigger cria a empresa e o profile.
--   - Colunas em camelCase (entre aspas) para casar 1:1 com o front-end.
--   - Ids em TEXT (uuid gerado por padrão) para aceitar também ids criados
--     no cliente (importações/offline).
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. EMPRESAS (tenant) — as "configurações" do app vivem aqui
-- ============================================================================
create table if not exists public.empresas (
  id          text primary key default gen_random_uuid()::text,
  nome        text not null default 'Meu Negócio',
  segmento    text not null default 'restaurante',
  moeda       text not null default 'BRL',
  -- metas de gestão exibidas no dashboard/alertas
  metas       jsonb not null default '{"cmvMax": 35, "margemIdeal": 65, "margemMinima": 50}',
  -- canais de venda e comissões (%) usados na precificação
  canais      jsonb not null default '{
    "balcao":   {"nome": "Balcão",           "comissao": 0},
    "delivery": {"nome": "Delivery próprio", "comissao": 0},
    "ifood":    {"nome": "iFood",            "comissao": 25},
    "app99":    {"nome": "99Food",           "comissao": 20},
    "keeta":    {"nome": "Keeta",            "comissao": 18}
  }',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- ============================================================================
-- 2. PROFILES — liga auth.users à empresa (multiusuário/permissões)
-- ============================================================================
create table if not exists public.profiles (
  "userId"    uuid primary key references auth.users(id) on delete cascade,
  "empresaId" text not null references public.empresas(id) on delete cascade,
  nome        text not null,
  email       text not null,
  role        text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  "createdAt" timestamptz not null default now()
);

-- Helper usado por todas as políticas RLS: empresa do usuário logado.
-- SECURITY DEFINER para poder ler profiles dentro das políticas sem recursão.
create or replace function public.current_empresa_id()
returns text
language sql stable security definer
set search_path = public
as $$
  select "empresaId" from public.profiles where "userId" = auth.uid()
$$;

-- Trigger de novo usuário: cria a empresa e o profile automaticamente.
-- O nome/empresa vêm do metadata enviado no signUp pelo front-end.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_empresa text;
begin
  insert into public.empresas (nome)
  values (coalesce(nullif(new.raw_user_meta_data->>'empresa', ''), 'Meu Negócio'))
  returning id into v_empresa;

  insert into public.profiles ("userId", "empresaId", nome, email, role)
  values (
    new.id,
    v_empresa,
    coalesce(nullif(new.raw_user_meta_data->>'nome', ''), split_part(new.email, '@', 1)),
    new.email,
    'owner'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger genérico de updatedAt
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;

-- ============================================================================
-- 3. TABELAS DE DADOS (todas com "empresaId" + RLS)
-- ============================================================================

create table if not exists public.categorias (
  id          text primary key default gen_random_uuid()::text,
  "empresaId" text not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome        text not null,
  tipo        text not null check (tipo in ('ingrediente', 'produto')),
  cor         text default '#2563EB',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.fornecedores (
  id            text primary key default gen_random_uuid()::text,
  "empresaId"   text not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome          text not null,
  contato       text default '',
  observacoes   text default '',
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);

create table if not exists public.ingredientes (
  id              text primary key default gen_random_uuid()::text,
  "empresaId"     text not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome            text not null,
  "categoriaId"   text references public.categorias(id) on delete set null,
  "fornecedorId"  text references public.fornecedores(id) on delete set null,
  codigo          text default '',
  unidade         text not null default 'un',      -- kg | g | l | ml | un
  "qtdEmbalagem"  numeric not null default 1,       -- tamanho da embalagem comprada
  preco           numeric not null default 0,       -- preço da embalagem
  "precoAnterior" numeric,
  historico       jsonb not null default '[]',      -- [{data, preco}]
  estoque         numeric,
  "estoqueMin"    numeric,
  observacoes     text default '',
  imagem          text default '',
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now()
);

create table if not exists public.produtos (
  id              text primary key default gen_random_uuid()::text,
  "empresaId"     text not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome            text not null,
  "categoriaId"   text references public.categorias(id) on delete set null,
  descricao       text default '',
  -- preços por canal: {balcao, delivery, ifood, app99, keeta}
  precos          jsonb not null default '{}',
  "taxaEmbalagem" numeric not null default 0,
  "margemMinima"  numeric not null default 50,
  "margemIdeal"   numeric not null default 65,
  -- ficha técnica: {itens:[{ingredienteId,qtd,unidade,perda}], rendimento,
  --                 pesoFinal, preparo, tempoMin}
  ficha           jsonb not null default '{"itens": [], "rendimento": 1}',
  imagem          text default '',
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now()
);

-- Versões de ficha técnica (histórico/rollback)
create table if not exists public.ficha_versoes (
  id          text primary key default gen_random_uuid()::text,
  "empresaId" text not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  "produtoId" text not null references public.produtos(id) on delete cascade,
  label       text default '',
  ficha       jsonb not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.vendas (
  id          text primary key default gen_random_uuid()::text,
  "empresaId" text not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  data        timestamptz not null default now(),
  "produtoId" text references public.produtos(id) on delete set null,
  canal       text not null default 'balcao',
  qtd         numeric not null default 1,
  "precoUnit" numeric not null default 0,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.despesas (
  id          text primary key default gen_random_uuid()::text,
  "empresaId" text not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  nome        text not null,
  valor       numeric not null default 0,
  tipo        text not null default 'fixa' check (tipo in ('fixa', 'variavel')),
  data        timestamptz not null default now(),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- Movimentações de estoque (fase Estoque)
create table if not exists public.movimentos (
  id              text primary key default gen_random_uuid()::text,
  "empresaId"     text not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  "ingredienteId" text references public.ingredientes(id) on delete cascade,
  tipo            text not null check (tipo in ('entrada', 'saida', 'perda', 'ajuste')),
  qtd             numeric not null,
  custo           numeric,
  lote            text default '',
  validade        date,
  observacoes     text default '',
  data            timestamptz not null default now(),
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now()
);

-- Pedidos de compra (fase Compras)
create table if not exists public.compras (
  id             text primary key default gen_random_uuid()::text,
  "empresaId"    text not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  "fornecedorId" text references public.fornecedores(id) on delete set null,
  status         text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'recebido', 'cancelado')),
  itens          jsonb not null default '[]',   -- [{ingredienteId, qtd, precoUnit}]
  total          numeric not null default 0,
  data           timestamptz not null default now(),
  "createdAt"    timestamptz not null default now(),
  "updatedAt"    timestamptz not null default now()
);

-- ============================================================================
-- 4. ÍNDICES
-- ============================================================================
create index if not exists idx_categorias_empresa    on public.categorias ("empresaId");
create index if not exists idx_fornecedores_empresa  on public.fornecedores ("empresaId");
create index if not exists idx_ingredientes_empresa  on public.ingredientes ("empresaId");
create index if not exists idx_produtos_empresa      on public.produtos ("empresaId");
create index if not exists idx_fichaversoes_empresa  on public.ficha_versoes ("empresaId");
create index if not exists idx_fichaversoes_produto  on public.ficha_versoes ("produtoId");
create index if not exists idx_vendas_empresa        on public.vendas ("empresaId");
create index if not exists idx_vendas_data           on public.vendas (data);
create index if not exists idx_vendas_produto        on public.vendas ("produtoId");
create index if not exists idx_despesas_empresa      on public.despesas ("empresaId");
create index if not exists idx_movimentos_empresa    on public.movimentos ("empresaId");
create index if not exists idx_movimentos_ingrediente on public.movimentos ("ingredienteId");
create index if not exists idx_compras_empresa       on public.compras ("empresaId");
create index if not exists idx_profiles_empresa      on public.profiles ("empresaId");

-- ============================================================================
-- 5. TRIGGERS updatedAt
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['empresas','categorias','fornecedores','ingredientes',
                           'produtos','ficha_versoes','vendas','despesas',
                           'movimentos','compras']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ============================================================================
-- 6. ROW LEVEL SECURITY — isolamento total por empresa
-- ============================================================================

alter table public.empresas      enable row level security;
alter table public.profiles      enable row level security;
alter table public.categorias    enable row level security;
alter table public.fornecedores  enable row level security;
alter table public.ingredientes  enable row level security;
alter table public.produtos      enable row level security;
alter table public.ficha_versoes enable row level security;
alter table public.vendas        enable row level security;
alter table public.despesas      enable row level security;
alter table public.movimentos    enable row level security;
alter table public.compras       enable row level security;

-- EMPRESAS: o usuário vê e edita apenas a própria empresa
drop policy if exists empresas_select on public.empresas;
create policy empresas_select on public.empresas for select
  to authenticated using (id = public.current_empresa_id());

drop policy if exists empresas_update on public.empresas;
create policy empresas_update on public.empresas for update
  to authenticated using (id = public.current_empresa_id());

-- PROFILES: vê colegas da mesma empresa; edita apenas o próprio
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  to authenticated using ("empresaId" = public.current_empresa_id());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  to authenticated using ("userId" = auth.uid());

-- AUTO-PROVISIONAMENTO (plano B do trigger): usuário sem perfil pode criar
-- a própria empresa e o próprio perfil pelo app.
drop policy if exists empresas_insert on public.empresas;
create policy empresas_insert on public.empresas for insert
  to authenticated
  with check (
    not exists (select 1 from public.profiles where "userId" = auth.uid())
  );

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert
  to authenticated
  with check ("userId" = auth.uid());

-- DADOS: política padrão (CRUD completo dentro da empresa) para cada tabela
do $$
declare
  t text;
begin
  foreach t in array array['categorias','fornecedores','ingredientes','produtos',
                           'ficha_versoes','vendas','despesas','movimentos','compras']
  loop
    execute format('drop policy if exists %I_all on public.%I', t, t);
    execute format(
      'create policy %I_all on public.%I for all to authenticated
         using ("empresaId" = public.current_empresa_id())
         with check ("empresaId" = public.current_empresa_id())', t, t);
  end loop;
end;
$$;

-- ============================================================================
-- 7. (OPCIONAL) Realtime — descomente para receber mudanças ao vivo
-- ============================================================================
-- alter publication supabase_realtime add table public.ingredientes;
-- alter publication supabase_realtime add table public.produtos;
-- alter publication supabase_realtime add table public.vendas;

-- ============================================================================
-- 8. BACKFILL — provisiona empresa/perfil para usuários criados antes deste
--    schema (sem efeito em instalações novas; pode rodar mais de uma vez)
-- ============================================================================
do $$
declare
  u record;
  v_empresa text;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
    from auth.users au
    left join public.profiles p on p."userId" = au.id
    where p."userId" is null
  loop
    insert into public.empresas (nome)
    values (coalesce(nullif(u.raw_user_meta_data->>'empresa', ''), 'Meu Negócio'))
    returning id into v_empresa;

    insert into public.profiles ("userId", "empresaId", nome, email, role)
    values (
      u.id, v_empresa,
      coalesce(nullif(u.raw_user_meta_data->>'nome', ''), split_part(u.email, '@', 1)),
      u.email, 'owner'
    );
  end loop;
end;
$$;

-- Pronto! Crie um usuário pelo app (tela de cadastro) e tudo será
-- provisionado automaticamente pelo trigger handle_new_user.
