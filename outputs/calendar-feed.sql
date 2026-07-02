alter table public.teams
add column if not exists calendar_feed_token uuid not null default gen_random_uuid();

update public.teams
set calendar_feed_token = gen_random_uuid()
where calendar_feed_token is null;
