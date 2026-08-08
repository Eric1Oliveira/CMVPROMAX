-- ============================================================================
-- CMV Pro — Correção: contas criadas ANTES do schema (sem empresa/perfil)
-- ----------------------------------------------------------------------------
-- Sintoma: erro 406 "Cannot coerce the result to a single JSON object" ao
-- abrir o dashboard — o usuário logado não tem linha em profiles/empresas.
--
-- COMO USAR: SQL Editor → New query → cole este arquivo → RUN.
-- Pode rodar quantas vezes quiser (idempotente).
-- ============================================================================

-- 1) Políticas de AUTO-PROVISIONAMENTO: permitem que o próprio app crie a
--    empresa e o perfil quando estiverem faltando (plano B do trigger).

-- Usuário SEM perfil pode criar UMA empresa (quem já tem perfil, não pode)
drop policy if exists empresas_insert on public.empresas;
create policy empresas_insert on public.empresas for insert
  to authenticated
  with check (
    not exists (select 1 from public.profiles where "userId" = auth.uid())
  );

-- Usuário só pode criar o PRÓPRIO perfil (a PK impede duplicidade)
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert
  to authenticated
  with check ("userId" = auth.uid());

-- 2) BACKFILL: provisiona empresa + perfil para todo usuário antigo que
--    ainda não tem (o mesmo que o trigger teria feito no cadastro).
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
      u.id,
      v_empresa,
      coalesce(nullif(u.raw_user_meta_data->>'nome', ''), split_part(u.email, '@', 1)),
      u.email,
      'owner'
    );

    raise notice 'Provisionado: % (empresa %)', u.email, v_empresa;
  end loop;
end;
$$;

-- Confira o resultado: todo usuário deve aparecer com empresa
select p.email, p.nome, p.role, e.nome as empresa
from public.profiles p
join public.empresas e on e.id = p."empresaId";
