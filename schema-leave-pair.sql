-- =========================================
-- 允许退出二人空间（在 SQL Editor 运行）
-- =========================================

drop policy if exists "pairs_update" on public.pairs;
drop policy if exists "pairs_delete" on public.pairs;

-- 成员都可更新（加入 / 退出 / 转让）
create policy "pairs_update"
  on public.pairs for update
  using (
    auth.uid() = owner_id
    or auth.uid() = partner_id
    or (partner_id is null and auth.uid() is not null)
  )
  with check (
    auth.uid() = owner_id
    or auth.uid() = partner_id
    or partner_id is null
  );

-- 仅「还没人加入」时，创建者可删除空房间
create policy "pairs_delete"
  on public.pairs for delete
  using (auth.uid() = owner_id and partner_id is null);
