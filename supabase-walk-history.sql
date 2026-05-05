create table if not exists public.walk_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  mode         text not null,
  dest_name    text,
  dist_km      double precision not null,
  duration_sec integer not null,
  walked_at    timestamptz not null default now()
);

alter table public.walk_history enable row level security;

create policy "Users can read own walk history"
  on public.walk_history for select using (auth.uid() = user_id);

create policy "Users can insert own walk history"
  on public.walk_history for insert with check (auth.uid() = user_id);

create policy "Users can delete own walk history"
  on public.walk_history for delete using (auth.uid() = user_id);
