-- Creates broadcast notification rows inside Supabase so browser RLS cannot block bulk recipient inserts.
-- This does not delete data.

create or replace function public.create_broadcast_notifications(
  p_team_id uuid,
  p_title text,
  p_body text
)
returns table(notification_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid();

  if v_profile.id is null or v_profile.team_id <> p_team_id or v_profile.role <> 'coach' then
    raise exception 'Only coaches can notify this team';
  end if;

  return query
    insert into public.notifications (team_id, recipient_id, title, body, notification_type)
    select
      p_team_id,
      p.id,
      coalesce(nullif(trim(p_title), ''), 'Team Broadcast'),
      coalesce(nullif(trim(p_body), ''), 'New team broadcast'),
      'broadcast'
    from public.profiles p
    where p.team_id = p_team_id
      and p.id <> auth.uid()
      and p.role in ('parent', 'follower')
    returning id;
end;
$$;

grant execute on function public.create_broadcast_notifications(uuid, text, text) to authenticated;
