-- =========================================
-- 馨宝与树宝：共享日记本（在已有 pairs 表基础上运行）
-- 若还没跑过练习项目的 schema-project2.sql，请先运行那份
-- =========================================

create table if not exists public.journals (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null unique references public.pairs (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.journals enable row level security;

drop policy if exists "journals_select" on public.journals;
drop policy if exists "journals_insert" on public.journals;
drop policy if exists "journals_update" on public.journals;

create policy "journals_select"
  on public.journals for select
  using (
    pair_id in (
      select id from public.pairs
      where owner_id = auth.uid() or partner_id = auth.uid()
    )
  );

create policy "journals_insert"
  on public.journals for insert
  with check (
    pair_id in (
      select id from public.pairs
      where owner_id = auth.uid() or partner_id = auth.uid()
    )
  );

create policy "journals_update"
  on public.journals for update
  using (
    pair_id in (
      select id from public.pairs
      where owner_id = auth.uid() or partner_id = auth.uid()
    )
  )
  with check (
    pair_id in (
      select id from public.pairs
      where owner_id = auth.uid() or partner_id = auth.uid()
    )
  );
