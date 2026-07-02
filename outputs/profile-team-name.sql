alter table public.profiles
add column if not exists team_name text;

create or replace function public.set_profile_team_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_id is null then
    new.team_name = null;
  else
    select name into new.team_name
    from public.teams
    where id = new.team_id;
  end if;

  return new;
end;
$$;

drop trigger if exists set_profile_team_name_before_write on public.profiles;
create trigger set_profile_team_name_before_write
before insert or update of team_id on public.profiles
for each row execute function public.set_profile_team_name();

create or replace function public.sync_profile_team_name_from_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set team_name = new.name
  where team_id = new.id;

  return new;
end;
$$;

drop trigger if exists sync_profile_team_name_after_team_update on public.teams;
create trigger sync_profile_team_name_after_team_update
after update of name on public.teams
for each row
when (old.name is distinct from new.name)
execute function public.sync_profile_team_name_from_team();

update public.profiles p
set team_name = t.name
from public.teams t
where p.team_id = t.id
  and p.team_name is distinct from t.name;
