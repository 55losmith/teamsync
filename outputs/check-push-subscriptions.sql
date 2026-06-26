-- Shows who has a push-enabled device saved.
-- Use this to confirm the parent phone created a push_subscriptions row.

select
  p.role,
  p.full_name,
  p.email,
  count(ps.id) filter (where ps.enabled) as enabled_push_devices,
  max(ps.updated_at) as latest_push_update
from public.profiles p
left join public.push_subscriptions ps
  on ps.profile_id = p.id
where p.team_id = public.current_team_id()
group by p.role, p.full_name, p.email
order by p.role, p.full_name, p.email;
