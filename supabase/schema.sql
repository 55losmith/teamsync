create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season text,
  age_group text default '9U Travel',
  location text default 'Texas',
  head_coach text,
  monthly_dues numeric(10, 2) not null default 0,
  daily_pitch_limit integer not null default 75,
  join_code text unique not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.teams add column if not exists age_group text default '9U Travel';
alter table public.teams add column if not exists location text default 'Texas';
alter table public.teams add column if not exists head_coach text;
alter table public.teams add column if not exists monthly_dues numeric(10, 2) not null default 0;
alter table public.teams add column if not exists daily_pitch_limit integer not null default 75;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null check (role in ('coach', 'parent', 'follower')),
  team_id uuid references public.teams(id) on delete set null,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('coach', 'parent', 'follower'));

create table if not exists public.roster_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_name text not null,
  jersey_number text,
  position text,
  bats text,
  throws text,
  parent_name text,
  parent_email text,
  parent_phone text,
  parent_profile_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.roster_members add column if not exists bats text;
alter table public.roster_members add column if not exists throws text;
alter table public.roster_members add column if not exists parent_phone text;
alter table public.roster_members add column if not exists parent_profile_id uuid references public.profiles(id) on delete set null;

create table if not exists public.roster_parent_claims (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  roster_member_id uuid not null references public.roster_members(id) on delete cascade,
  parent_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (roster_member_id, parent_profile_id)
);

insert into public.roster_parent_claims (team_id, roster_member_id, parent_profile_id)
select team_id, id, parent_profile_id
from public.roster_members
where parent_profile_id is not null
on conflict (roster_member_id, parent_profile_id) do nothing;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null,
  event_type text not null default 'practice' check (event_type in ('practice', 'game', 'meeting', 'other')),
  starts_at timestamptz not null,
  location text,
  opponent text,
  home_away text default 'home' check (home_away in ('home', 'away', 'neutral')),
  our_score integer,
  opponent_score integer,
  result text default '' check (result in ('', 'win', 'loss', 'tie')),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.events add column if not exists opponent text;
alter table public.events add column if not exists home_away text default 'home';
alter table public.events add column if not exists status text not null default 'scheduled';
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check check (status in ('scheduled', 'cancelled'));
alter table public.events add column if not exists our_score integer;
alter table public.events add column if not exists opponent_score integer;
alter table public.events add column if not exists result text default '';

create table if not exists public.dues (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  roster_member_id uuid references public.roster_members(id) on delete set null,
  title text not null,
  due_type text not null default 'monthly' check (due_type in ('monthly', 'tournament', 'other')),
  amount numeric(10, 2) not null default 0,
  due_date date,
  status text not null default 'unpaid',
  paid_amount numeric(10, 2) not null default 0,
  waived_amount numeric(10, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.dues add column if not exists due_type text not null default 'monthly';
alter table public.dues add column if not exists waived_amount numeric(10, 2) not null default 0;
alter table public.dues drop constraint if exists dues_status_check;
alter table public.dues add constraint dues_status_check check (status in ('unpaid', 'partial', 'paid', 'waived'));
alter table public.dues drop constraint if exists dues_due_type_check;
alter table public.dues add constraint dues_due_type_check check (due_type in ('monthly', 'tournament', 'other'));

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null,
  body text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.pitch_counts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  roster_member_id uuid references public.roster_members(id) on delete set null,
  pitches integer not null default 0,
  pitched_on date not null default current_date,
  opponent text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  subject text not null,
  recipient_type text not null default 'all_parents',
  recipient_name text,
  recipient_email text,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  roster_member_id uuid references public.roster_members(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations add column if not exists recipient_type text not null default 'all_parents';
alter table public.conversations add column if not exists recipient_profile_id uuid references public.profiles(id) on delete set null;
alter table public.conversations add column if not exists roster_member_id uuid references public.roster_members(id) on delete set null;

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  title text not null,
  body text not null,
  notification_type text not null default 'message',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case
      when new.raw_user_meta_data->>'role' in ('coach', 'parent', 'follower') then new.raw_user_meta_data->>'role'
      else 'parent'
    end,
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.roster_members enable row level security;
alter table public.roster_parent_claims enable row level security;
alter table public.events enable row level security;
alter table public.dues enable row level security;
alter table public.announcements enable row level security;
alter table public.pitch_counts enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.notifications enable row level security;

create or replace function public.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.join_team_by_code(p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
begin
  select id into v_team_id
  from public.teams
  where join_code = upper(trim(p_join_code));

  if v_team_id is null then
    raise exception 'Team code not found';
  end if;

  update public.profiles
  set team_id = v_team_id
  where id = auth.uid();

  return v_team_id;
end;
$$;

create or replace function public.claim_roster_member(p_roster_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_player public.roster_members%rowtype;
  v_player_id uuid;
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid();

  if v_profile.id is null or v_profile.team_id is null then
    raise exception 'Join a team before claiming a player';
  end if;

  if v_profile.role <> 'parent' then
    raise exception 'Only parent accounts can claim players';
  end if;

  select * into v_player
  from public.roster_members
  where id = p_roster_member_id
    and team_id = v_profile.team_id;

  if v_player.id is null then
    raise exception 'That player is not on your team';
  end if;

  insert into public.roster_parent_claims (team_id, roster_member_id, parent_profile_id)
  values (v_profile.team_id, p_roster_member_id, v_profile.id)
  on conflict (roster_member_id, parent_profile_id) do nothing
  returning roster_member_id into v_player_id;

  update public.roster_members
  set
    parent_profile_id = coalesce(parent_profile_id, v_profile.id),
    parent_name = coalesce(nullif(parent_name, ''), v_profile.full_name),
    parent_email = coalesce(nullif(parent_email, ''), v_profile.email)
  where id = p_roster_member_id
    and team_id = v_profile.team_id;

  return p_roster_member_id;
end;
$$;

create or replace function public.is_claimed_roster_member(p_roster_member_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.roster_parent_claims
    where roster_member_id = p_roster_member_id
      and team_id = public.current_team_id()
      and parent_profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.roster_members
    where id = p_roster_member_id
      and team_id = public.current_team_id()
      and parent_profile_id = auth.uid()
  );
$$;

create or replace function public.can_read_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_conversation public.conversations%rowtype;
begin
  select * into v_conversation
  from public.conversations
  where id = p_conversation_id;

  if v_conversation.id is null or v_conversation.team_id <> public.current_team_id() then
    return false;
  end if;

  if public.current_role() = 'coach' then
    return true;
  end if;

  if public.current_role() = 'follower' then
    return false;
  end if;

  return v_conversation.created_by = auth.uid()
    or v_conversation.recipient_type in ('all_team', 'all_parents')
    or v_conversation.recipient_profile_id = auth.uid()
    or public.is_claimed_roster_member(v_conversation.roster_member_id);
end;
$$;

create or replace function public.start_conversation_thread(
  p_team_id uuid,
  p_subject text,
  p_body text,
  p_recipient_type text default 'all_coaches',
  p_recipient_name text default null,
  p_recipient_profile_id uuid default null,
  p_roster_member_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_conversation_id uuid;
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid();

  if v_profile.id is null or v_profile.team_id <> p_team_id then
    raise exception 'Join this team before sending messages';
  end if;

  if v_profile.role not in ('coach', 'parent') then
    raise exception 'Followers cannot send private messages';
  end if;

  insert into public.conversations (
    team_id,
    subject,
    recipient_type,
    recipient_name,
    recipient_profile_id,
    roster_member_id,
    created_by,
    updated_at
  )
  values (
    p_team_id,
    coalesce(nullif(trim(p_subject), ''), 'Message'),
    coalesce(nullif(trim(p_recipient_type), ''), 'all_coaches'),
    nullif(trim(p_recipient_name), ''),
    p_recipient_profile_id,
    p_roster_member_id,
    auth.uid(),
    now()
  )
  returning id into v_conversation_id;

  insert into public.conversation_messages (team_id, conversation_id, sender_id, body)
  values (p_team_id, v_conversation_id, auth.uid(), coalesce(nullif(trim(p_body), ''), 'Message'));

  insert into public.notifications (team_id, recipient_id, conversation_id, title, body, notification_type)
  select p_team_id, p.id, v_conversation_id, p_subject, p_body, 'message'
  from public.profiles p
  where p.team_id = p_team_id
    and p.id <> auth.uid()
    and (
      p_recipient_type = 'all_team'
      or (p_recipient_type = 'all_parents' and p.role = 'parent')
      or (p_recipient_type = 'all_coaches' and p.role = 'coach')
      or (p_recipient_type = 'profile' and p.id = p_recipient_profile_id)
      or (
        p_recipient_type = 'player_parent'
        and (
          p.id = p_recipient_profile_id
          or exists (
            select 1
            from public.roster_parent_claims rpc
            where rpc.roster_member_id = p_roster_member_id
              and rpc.parent_profile_id = p.id
          )
          or exists (
            select 1
            from public.roster_members rm
            where rm.id = p_roster_member_id
              and lower(rm.parent_email) = lower(p.email)
          )
        )
      )
    );

  return v_conversation_id;
end;
$$;

create or replace function public.reply_to_conversation_thread(
  p_conversation_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_conversation public.conversations%rowtype;
  v_message_id uuid;
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid();

  select * into v_conversation
  from public.conversations
  where id = p_conversation_id;

  if v_profile.id is null or v_conversation.id is null or v_profile.team_id <> v_conversation.team_id then
    raise exception 'You cannot reply to this conversation';
  end if;

  if v_profile.role not in ('coach', 'parent') or not public.can_read_conversation(p_conversation_id) then
    raise exception 'You cannot reply to this conversation';
  end if;

  insert into public.conversation_messages (team_id, conversation_id, sender_id, body)
  values (v_conversation.team_id, p_conversation_id, auth.uid(), coalesce(nullif(trim(p_body), ''), 'Message'))
  returning id into v_message_id;

  update public.conversations
  set updated_at = now()
  where id = p_conversation_id;

  insert into public.notifications (team_id, recipient_id, conversation_id, title, body, notification_type)
  select v_conversation.team_id, p.id, p_conversation_id, v_conversation.subject, p_body, 'message'
  from public.profiles p
  where p.team_id = v_conversation.team_id
    and p.id <> auth.uid()
    and public.can_read_conversation(p_conversation_id);

  return v_message_id;
end;
$$;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or (
    team_id = public.current_team_id()
    and public.current_role() = 'coach'
  )
);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Authenticated users can create teams" on public.teams;
create policy "Authenticated users can create teams"
on public.teams for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "Team members can read their team" on public.teams;
create policy "Team members can read their team"
on public.teams for select
to authenticated
using (id = public.current_team_id() or created_by = auth.uid());

drop policy if exists "Coaches can update their team" on public.teams;
create policy "Coaches can update their team"
on public.teams for update
to authenticated
using (created_by = auth.uid() or (id = public.current_team_id() and public.current_role() = 'coach'))
with check (created_by = auth.uid() or (id = public.current_team_id() and public.current_role() = 'coach'));

drop policy if exists "Team members can read roster" on public.roster_members;
create policy "Team members can read roster"
on public.roster_members for select
to authenticated
using (team_id = public.current_team_id() and public.current_role() in ('coach', 'parent'));

drop policy if exists "Coaches can manage roster" on public.roster_members;
create policy "Coaches can manage roster"
on public.roster_members for all
to authenticated
using (team_id = public.current_team_id() and public.current_role() = 'coach')
with check (team_id = public.current_team_id() and public.current_role() = 'coach');

drop policy if exists "Team members can read parent claims" on public.roster_parent_claims;
create policy "Team members can read parent claims"
on public.roster_parent_claims for select
to authenticated
using (
  team_id = public.current_team_id()
  and (
    public.current_role() = 'coach'
    or parent_profile_id = auth.uid()
  )
);

drop policy if exists "Parents can create their own claims" on public.roster_parent_claims;
create policy "Parents can create their own claims"
on public.roster_parent_claims for insert
to authenticated
with check (
  team_id = public.current_team_id()
  and public.current_role() = 'parent'
  and parent_profile_id = auth.uid()
);

drop policy if exists "Coaches can manage parent claims" on public.roster_parent_claims;
create policy "Coaches can manage parent claims"
on public.roster_parent_claims for all
to authenticated
using (team_id = public.current_team_id() and public.current_role() = 'coach')
with check (team_id = public.current_team_id() and public.current_role() = 'coach');

drop policy if exists "Team members can read events" on public.events;
create policy "Team members can read events"
on public.events for select
to authenticated
using (team_id = public.current_team_id());

drop policy if exists "Coaches can manage events" on public.events;
create policy "Coaches can manage events"
on public.events for all
to authenticated
using (team_id = public.current_team_id() and public.current_role() = 'coach')
with check (team_id = public.current_team_id() and public.current_role() = 'coach');

drop policy if exists "Team members can read dues" on public.dues;
create policy "Team members can read dues"
on public.dues for select
to authenticated
using (
  team_id = public.current_team_id()
  and (
    public.current_role() = 'coach'
    or public.is_claimed_roster_member(roster_member_id)
  )
);

drop policy if exists "Coaches can manage dues" on public.dues;
create policy "Coaches can manage dues"
on public.dues for all
to authenticated
using (team_id = public.current_team_id() and public.current_role() = 'coach')
with check (team_id = public.current_team_id() and public.current_role() = 'coach');

drop policy if exists "Team members can read announcements" on public.announcements;
create policy "Team members can read announcements"
on public.announcements for select
to authenticated
using (team_id = public.current_team_id());

drop policy if exists "Coaches can manage announcements" on public.announcements;
create policy "Coaches can manage announcements"
on public.announcements for all
to authenticated
using (team_id = public.current_team_id() and public.current_role() = 'coach')
with check (team_id = public.current_team_id() and public.current_role() = 'coach');

drop policy if exists "Team members can read pitch counts" on public.pitch_counts;
create policy "Team members can read pitch counts"
on public.pitch_counts for select
to authenticated
using (team_id = public.current_team_id());

drop policy if exists "Coaches can manage pitch counts" on public.pitch_counts;
create policy "Coaches can manage pitch counts"
on public.pitch_counts for all
to authenticated
using (team_id = public.current_team_id() and public.current_role() = 'coach')
with check (team_id = public.current_team_id() and public.current_role() = 'coach');

drop policy if exists "Team members can read conversations" on public.conversations;
create policy "Team members can read conversations"
on public.conversations for select
to authenticated
using (public.can_read_conversation(id));

drop policy if exists "Team members can create conversations" on public.conversations;
create policy "Team members can create conversations"
on public.conversations for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.team_id = conversations.team_id
      and p.role in ('coach', 'parent')
  )
);

drop policy if exists "Team members can update conversations" on public.conversations;
create policy "Team members can update conversations"
on public.conversations for update
to authenticated
using (team_id = public.current_team_id() and public.current_role() = 'coach')
with check (team_id = public.current_team_id() and public.current_role() = 'coach');

drop policy if exists "Team members can read conversation messages" on public.conversation_messages;
create policy "Team members can read conversation messages"
on public.conversation_messages for select
to authenticated
using (team_id = public.current_team_id() and public.can_read_conversation(conversation_id));

drop policy if exists "Team members can create conversation messages" on public.conversation_messages;
create policy "Team members can create conversation messages"
on public.conversation_messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.team_id = conversation_messages.team_id
      and p.role in ('coach', 'parent')
  )
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_messages.conversation_id
      and c.team_id = conversation_messages.team_id
      and public.can_read_conversation(c.id)
  )
);

drop policy if exists "Users can read their notifications" on public.notifications;
create policy "Users can read their notifications"
on public.notifications for select
to authenticated
using (recipient_id = auth.uid() and team_id = public.current_team_id());

drop policy if exists "Team members can create notifications" on public.notifications;
create policy "Team members can create notifications"
on public.notifications for insert
to authenticated
with check (team_id = public.current_team_id());

drop policy if exists "Users can update their notifications" on public.notifications;
create policy "Users can update their notifications"
on public.notifications for update
to authenticated
using (recipient_id = auth.uid() and team_id = public.current_team_id())
with check (recipient_id = auth.uid() and team_id = public.current_team_id());
