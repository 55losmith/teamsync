# HuddleUp

A simple Vite React + Supabase app for youth team coordination.

## Features

- Coach and parent auth with Supabase Auth
- Role-based coach and parent dashboards
- Team roster
- Schedule/events
- Dues tracking
- Announcements
- Supabase table schema and RLS policies
- Vercel-ready Vite setup

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

3. Add your Supabase values:

   ```bash
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```

4. In Supabase, open SQL Editor and run [supabase/schema.sql](supabase/schema.sql).

   If you see an error like `invalid input syntax for type bigint`, this project likely has
   an older `public.profiles` table with the wrong id type. If you do not need the public
   table data in this Supabase project, run [supabase/reset-team-sync.sql](supabase/reset-team-sync.sql)
   first, then run [supabase/schema.sql](supabase/schema.sql) again.

5. Start the app:

   ```bash
   npm run dev
   ```

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel project settings.
4. Deploy.

## First use

1. Sign up as a coach.
2. Create a team from the coach dashboard.
3. Share the team code with parents.
4. Parents sign up, join with the code, and can view team info.
