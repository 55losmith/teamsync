-- Use this only if this Supabase project does not have public table data you need to keep.
-- It removes the TeamSync public tables/functions so schema.sql can recreate them with UUID ids.

drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.join_team_by_code(text);
drop function if exists public.claim_roster_member(uuid);
drop function if exists public.is_claimed_roster_member(uuid);
drop function if exists public.can_read_conversation(uuid);
drop function if exists public.current_team_id();
drop function if exists public.current_role();
drop function if exists public.handle_new_user();
drop function if exists public.set_profile_team_name();
drop function if exists public.sync_profile_team_name_from_team();

drop table if exists public.notifications cascade;
drop table if exists public.conversation_messages cascade;
drop table if exists public.conversations cascade;
drop table if exists public.pitch_counts cascade;
drop table if exists public.announcements cascade;
drop table if exists public.dues cascade;
drop table if exists public.events cascade;
drop table if exists public.roster_parent_claims cascade;
drop table if exists public.roster_members cascade;
drop table if exists public.profiles cascade;
drop table if exists public.teams cascade;
