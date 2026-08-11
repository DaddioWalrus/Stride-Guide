-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: it creates the table if missing, adds any column the app
-- writes that the table does not have yet, and re-applies the RLS policies.
-- Without the insert policy every "Save route" tap fails with a permission
-- error, which is the usual reason saving appears to do nothing.

create table if not exists public.saved_routes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  mode       text not null,
  coords     jsonb,
  dist_km    double precision,
  created_at timestamptz not null default now()
);

-- Columns added after the first release
alter table public.saved_routes add column if not exists coords          jsonb;
alter table public.saved_routes add column if not exists dist_km         double precision;
alter table public.saved_routes add column if not exists loop_mode       text;
alter table public.saved_routes add column if not exists loop_value      double precision;
alter table public.saved_routes add column if not exists loop_use_metric boolean default true;
alter table public.saved_routes add column if not exists dest_lat        double precision;
alter table public.saved_routes add column if not exists dest_lng        double precision;
alter table public.saved_routes add column if not exists start_lat       double precision;
alter table public.saved_routes add column if not exists start_lng       double precision;

create index if not exists saved_routes_user_id_idx
  on public.saved_routes (user_id, created_at desc);

alter table public.saved_routes enable row level security;

drop policy if exists "Users can read own saved routes"   on public.saved_routes;
drop policy if exists "Users can insert own saved routes" on public.saved_routes;
drop policy if exists "Users can delete own saved routes" on public.saved_routes;

create policy "Users can read own saved routes"
  on public.saved_routes for select using (auth.uid() = user_id);

create policy "Users can insert own saved routes"
  on public.saved_routes for insert with check (auth.uid() = user_id);

create policy "Users can delete own saved routes"
  on public.saved_routes for delete using (auth.uid() = user_id);

-- If the table pre-dates this script it can carry required columns the app
-- never writes — a duration_sec left over from walk_history, say — and every
-- save fails on the not-null constraint. Make any such column optional. The
-- four the app always supplies stay required, and no data is dropped.

do $$
declare col record;
begin
  for col in
    select column_name
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'saved_routes'
       and is_nullable  = 'NO'
       and column_default is null
       and column_name not in ('id', 'user_id', 'name', 'mode')
  loop
    execute format('alter table public.saved_routes alter column %I drop not null', col.column_name);
    raise notice 'saved_routes.% is no longer required', col.column_name;
  end loop;
end $$;

-- PostgREST caches the schema; reload it so new columns are visible at once.
notify pgrst, 'reload schema';

-- What the table looks like now.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'saved_routes'
 order by ordinal_position;
