-- RAIN POKER PUB v0.1
-- Production schema for account-owned cloud saves.

create table if not exists public.game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  save_version integer not null default 1 check (save_version > 0),
  state jsonb not null default '{"version":1,"phase":"needs_pub_name"}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.game_saves enable row level security;

drop policy if exists "Players can read own save" on public.game_saves;
create policy "Players can read own save"
  on public.game_saves
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Players can create own save" on public.game_saves;
create policy "Players can create own save"
  on public.game_saves
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Players can update own save" on public.game_saves;
create policy "Players can update own save"
  on public.game_saves
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Players can delete own save" on public.game_saves;
create policy "Players can delete own save"
  on public.game_saves
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.game_saves from anon;
grant select, insert, update, delete on table public.game_saves to authenticated;
