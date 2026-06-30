create table if not exists public.lineup_plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  batting_order uuid[] not null default '{}',
  defense_plan jsonb not null default '{}'::jsonb,
  box_score_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id)
);

alter table public.lineup_plans add column if not exists batting_order uuid[] not null default '{}';
alter table public.lineup_plans add column if not exists defense_plan jsonb not null default '{}'::jsonb;
alter table public.lineup_plans add column if not exists box_score_notes text;
alter table public.lineup_plans add column if not exists updated_at timestamptz not null default now();

alter table public.lineup_plans enable row level security;

drop policy if exists "Team members can read lineup plans" on public.lineup_plans;
create policy "Team members can read lineup plans"
on public.lineup_plans for select
to authenticated
using (team_id = public.current_team_id());

drop policy if exists "Coaches can manage lineup plans" on public.lineup_plans;
create policy "Coaches can manage lineup plans"
on public.lineup_plans for all
to authenticated
using (team_id = public.current_team_id() and public.current_role() = 'coach')
with check (team_id = public.current_team_id() and public.current_role() = 'coach');

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
