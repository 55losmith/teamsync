alter table public.teams add column if not exists primary_color text not null default '#c92931';
alter table public.teams add column if not exists secondary_color text not null default '#111827';
alter table public.teams add column if not exists accent_color text not null default '#d39a24';
alter table public.teams add column if not exists logo_url text;

drop policy if exists "Coaches can manage dues" on public.dues;
create policy "Coaches can manage dues"
on public.dues for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'coach'
      and p.team_id = dues.team_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'coach'
      and p.team_id = dues.team_id
  )
);
