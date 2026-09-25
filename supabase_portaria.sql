-- ============================================================
-- Portaria / Lista de convidados — configuração inicial
-- Rode este script uma única vez no SQL Editor do Supabase.
-- ============================================================

create table if not exists public.lega_convidados (
  id uuid primary key default gen_random_uuid(),
  evento_id text not null,
  nome text not null,
  tipo text default 'adulto',
  aniversariante boolean default false,
  observacao text,
  presente boolean default false,
  entrada_em timestamptz,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  atualizado_por uuid references auth.users(id)
);

-- Caso a tabela já tenha sido criada antes sem esta coluna, este comando
-- adiciona ela sem apagar nada (idempotente).
alter table public.lega_convidados add column if not exists aniversariante boolean default false;

create index if not exists lega_convidados_evento_idx on public.lega_convidados (evento_id);
create index if not exists lega_convidados_nome_idx on public.lega_convidados (evento_id, nome);

alter table public.lega_convidados enable row level security;

-- Mesmo modelo do restante da plataforma: qualquer usuário autenticado
-- (funcionário logado) pode ler e escrever. Não é por evento nem por
-- usuário — igual ao comportamento já existente em lega_app_state.
drop policy if exists "lega_convidados_authenticated" on public.lega_convidados;
create policy "lega_convidados_authenticated"
  on public.lega_convidados
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Realtime é opcional: o app já sincroniza por polling (a cada 6s) para
-- funcionar bem em múltiplos iPads. Se quiser deixar mais instantâneo,
-- pode habilitar replicação realtime nesta tabela pelo painel do Supabase
-- (Database > Replication), mas não é necessário.
