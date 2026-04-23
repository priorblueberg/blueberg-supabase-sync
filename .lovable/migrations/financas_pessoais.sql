-- Finanças Pessoais: contas correntes, categorias/subcategorias, formas de pagamento (cartões), lançamentos

-- =============== CONTAS CORRENTES ===============
create table if not exists public.fp_contas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  banco text,
  data_inicio date not null,
  saldo_inicial numeric(18,2) not null default 0,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.fp_contas enable row level security;
create policy "fp_contas_select_own" on public.fp_contas for select to authenticated using (auth.uid() = user_id);
create policy "fp_contas_insert_own" on public.fp_contas for insert to authenticated with check (auth.uid() = user_id);
create policy "fp_contas_update_own" on public.fp_contas for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fp_contas_delete_own" on public.fp_contas for delete to authenticated using (auth.uid() = user_id);

-- =============== CATEGORIAS ===============
create table if not exists public.fp_categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade, -- null = padrão do sistema
  nome text not null,
  tipo text not null check (tipo in ('credito','debito')),
  is_padrao boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.fp_categorias enable row level security;
create policy "fp_categorias_select" on public.fp_categorias for select to authenticated using (user_id is null or auth.uid() = user_id);
create policy "fp_categorias_insert_own" on public.fp_categorias for insert to authenticated with check (auth.uid() = user_id);
create policy "fp_categorias_update_own" on public.fp_categorias for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fp_categorias_delete_own" on public.fp_categorias for delete to authenticated using (auth.uid() = user_id);

-- =============== SUBCATEGORIAS ===============
create table if not exists public.fp_subcategorias (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.fp_categorias(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  nome text not null,
  is_padrao boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.fp_subcategorias enable row level security;
create policy "fp_subcategorias_select" on public.fp_subcategorias for select to authenticated using (user_id is null or auth.uid() = user_id);
create policy "fp_subcategorias_insert_own" on public.fp_subcategorias for insert to authenticated with check (auth.uid() = user_id);
create policy "fp_subcategorias_update_own" on public.fp_subcategorias for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fp_subcategorias_delete_own" on public.fp_subcategorias for delete to authenticated using (auth.uid() = user_id);

-- =============== FORMAS DE PAGAMENTO (cartões / customizadas) ===============
create table if not exists public.fp_formas_pagamento (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  nome text not null,
  tipo text not null, -- dinheiro, debito, credito, pix, boleto, transferencia, cartao_credito, cartao_debito
  is_padrao boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.fp_formas_pagamento enable row level security;
create policy "fp_fp_select" on public.fp_formas_pagamento for select to authenticated using (user_id is null or auth.uid() = user_id);
create policy "fp_fp_insert_own" on public.fp_formas_pagamento for insert to authenticated with check (auth.uid() = user_id);
create policy "fp_fp_update_own" on public.fp_formas_pagamento for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fp_fp_delete_own" on public.fp_formas_pagamento for delete to authenticated using (auth.uid() = user_id);

-- =============== LANÇAMENTOS ===============
create table if not exists public.fp_lancamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conta_id uuid not null references public.fp_contas(id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('credito','debito')),
  valor numeric(18,2) not null check (valor >= 0),
  descricao text,
  categoria_id uuid references public.fp_categorias(id) on delete set null,
  subcategoria_id uuid references public.fp_subcategorias(id) on delete set null,
  forma_pagamento_id uuid references public.fp_formas_pagamento(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.fp_lancamentos enable row level security;
create policy "fp_lanc_select_own" on public.fp_lancamentos for select to authenticated using (auth.uid() = user_id);
create policy "fp_lanc_insert_own" on public.fp_lancamentos for insert to authenticated with check (auth.uid() = user_id);
create policy "fp_lanc_update_own" on public.fp_lancamentos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fp_lanc_delete_own" on public.fp_lancamentos for delete to authenticated using (auth.uid() = user_id);

create index if not exists idx_fp_lanc_user_data on public.fp_lancamentos(user_id, data);
create index if not exists idx_fp_lanc_conta on public.fp_lancamentos(conta_id);

-- =============== SEEDS PADRÃO ===============
-- Categorias padrão (user_id null)
insert into public.fp_categorias (user_id, nome, tipo, is_padrao) values
  (null, 'Salário', 'credito', true),
  (null, 'Rendimentos', 'credito', true),
  (null, 'Outras Receitas', 'credito', true),
  (null, 'Alimentação', 'debito', true),
  (null, 'Moradia', 'debito', true),
  (null, 'Transporte', 'debito', true),
  (null, 'Saúde', 'debito', true),
  (null, 'Educação', 'debito', true),
  (null, 'Lazer', 'debito', true),
  (null, 'Outras Despesas', 'debito', true)
on conflict do nothing;

-- Subcategorias padrão para algumas categorias
insert into public.fp_subcategorias (categoria_id, user_id, nome, is_padrao)
select c.id, null, s.nome, true
from public.fp_categorias c
join (values
  ('Alimentação','Supermercado'),
  ('Alimentação','Restaurante'),
  ('Alimentação','Delivery'),
  ('Moradia','Aluguel'),
  ('Moradia','Condomínio'),
  ('Moradia','Energia'),
  ('Moradia','Água'),
  ('Moradia','Internet'),
  ('Transporte','Combustível'),
  ('Transporte','Uber/Táxi'),
  ('Transporte','Transporte Público'),
  ('Saúde','Plano de Saúde'),
  ('Saúde','Farmácia'),
  ('Educação','Mensalidade'),
  ('Educação','Cursos'),
  ('Lazer','Streaming'),
  ('Lazer','Viagem')
) as s(cat, nome) on s.cat = c.nome and c.user_id is null
on conflict do nothing;

-- Formas de pagamento padrão
insert into public.fp_formas_pagamento (user_id, nome, tipo, is_padrao) values
  (null, 'Dinheiro', 'dinheiro', true),
  (null, 'Débito', 'debito', true),
  (null, 'Crédito', 'credito', true),
  (null, 'Pix', 'pix', true),
  (null, 'Boleto', 'boleto', true),
  (null, 'Transferência', 'transferencia', true)
on conflict do nothing;
