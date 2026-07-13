-- =========================================
-- 让二人日记变更能实时推到手机/电脑（只需在 Supabase SQL Editor 运行一次）
-- =========================================

-- 把 journals 表加入 Realtime 广播
alter publication supabase_realtime add table public.journals;
