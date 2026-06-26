create table if not exists public.player_game_stats (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  roster_member_id uuid not null references public.roster_members(id) on delete cascade,
  at_bats integer not null default 0,
  hits integer not null default 0,
  walks integer not null default 0,
  strikeouts integer not null default 0,
  runs integer not null default 0,
  rbi integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, roster_member_id)
);

alter table public.player_game_stats enable row level security;

drop policy if exists "Team members can read player game stats" on public.player_game_stats;
create policy "Team members can read player game stats"
on public.player_game_stats for select
to authenticated
using (team_id = public.current_team_id());

drop policy if exists "Coaches can manage player game stats" on public.player_game_stats;
create policy "Coaches can manage player game stats"
on public.player_game_stats for all
to authenticated
using (team_id = public.current_team_id() and public.current_role() = 'coach')
with check (team_id = public.current_team_id() and public.current_role() = 'coach');
