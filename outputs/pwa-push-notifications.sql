create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text,
  auth text,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notifications add column if not exists push_sent_at timestamptz;

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  push_enabled boolean not null default true,
  messages_enabled boolean not null default true,
  broadcasts_enabled boolean not null default true,
  schedule_enabled boolean not null default true,
  dues_enabled boolean not null default true,
  lineup_enabled boolean not null default true,
  pitch_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;

drop policy if exists "Users can read their push subscriptions" on public.push_subscriptions;
create policy "Users can read their push subscriptions"
on public.push_subscriptions for select
to authenticated
using (profile_id = auth.uid() and team_id = public.current_team_id());

drop policy if exists "Users can create their push subscriptions" on public.push_subscriptions;
create policy "Users can create their push subscriptions"
on public.push_subscriptions for insert
to authenticated
with check (profile_id = auth.uid() and team_id = public.current_team_id());

drop policy if exists "Users can update their push subscriptions" on public.push_subscriptions;
create policy "Users can update their push subscriptions"
on public.push_subscriptions for update
to authenticated
using (profile_id = auth.uid() and team_id = public.current_team_id())
with check (profile_id = auth.uid() and team_id = public.current_team_id());

drop policy if exists "Users can delete their push subscriptions" on public.push_subscriptions;
create policy "Users can delete their push subscriptions"
on public.push_subscriptions for delete
to authenticated
using (profile_id = auth.uid() and team_id = public.current_team_id());

drop policy if exists "Users can read their notification preferences" on public.notification_preferences;
create policy "Users can read their notification preferences"
on public.notification_preferences for select
to authenticated
using (profile_id = auth.uid() and team_id = public.current_team_id());

drop policy if exists "Users can create their notification preferences" on public.notification_preferences;
create policy "Users can create their notification preferences"
on public.notification_preferences for insert
to authenticated
with check (profile_id = auth.uid() and team_id = public.current_team_id());

drop policy if exists "Users can update their notification preferences" on public.notification_preferences;
create policy "Users can update their notification preferences"
on public.notification_preferences for update
to authenticated
using (profile_id = auth.uid() and team_id = public.current_team_id())
with check (profile_id = auth.uid() and team_id = public.current_team_id());
