-- Run this in Supabase SQL Editor

create table if not exists public.saved_locations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  lat        double precision not null,
  lng        double precision not null,
  created_at timestamptz not null default now()
);

alter table public.saved_locations enable row level security;

create policy "Users can read own saved locations"
  on public.saved_locations for select using (auth.uid() = user_id);

create policy "Users can insert own saved locations"
  on public.saved_locations for insert with check (auth.uid() = user_id);

create policy "Users can delete own saved locations"
  on public.saved_locations for delete using (auth.uid() = user_id);
