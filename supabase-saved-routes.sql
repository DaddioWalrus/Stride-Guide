create table if not exists public.saved_routes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  mode         text not null,
  start_lat    double precision,
  start_lng    double precision,
  dest_lat     double precision,
  dest_lng     double precision,
  loop_mode    text,
  loop_value   double precision,
  dist_km      double precision not null,
  duration_sec integer not null,
  route_coords text,
  created_at   timestamptz not null default now()
);

alter table public.saved_routes enable row level security;

create policy "Users can read own saved routes"
  on public.saved_routes for select using (auth.uid() = user_id);

create policy "Users can insert own saved routes"
  on public.saved_routes for insert with check (auth.uid() = user_id);

create policy "Users can delete own saved routes"
  on public.saved_routes for delete using (auth.uid() = user_id);
