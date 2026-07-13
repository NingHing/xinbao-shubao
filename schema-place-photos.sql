-- =========================================
-- 并记：足迹照片云端相册（解决日记过大 / 配额占满）
-- 在 Supabase → SQL Editor 里整段运行一次即可
-- =========================================

insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "place_photos_select" on storage.objects;
drop policy if exists "place_photos_select_auth" on storage.objects;
drop policy if exists "place_photos_insert" on storage.objects;
drop policy if exists "place_photos_update" on storage.objects;
drop policy if exists "place_photos_delete" on storage.objects;

-- 公开读：相册链接才能在 <img> 里直接显示（桶本身也是 public）
create policy "place_photos_select"
  on storage.objects for select
  to public
  using (bucket_id = 'place-photos');

-- 已登录用户可读（兼容）
create policy "place_photos_select_auth"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'place-photos');

-- 只能上传到自己的目录：{userId}/...
create policy "place_photos_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'place-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "place_photos_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'place-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'place-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "place_photos_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'place-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
