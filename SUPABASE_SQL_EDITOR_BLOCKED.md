# Supabase SQL Editor Is Greyed Out

Use this if the Supabase SQL Editor is disabled while setting up Legendary Auto Spa.

## First checks

1. Confirm you are in the correct Supabase project.
2. Open the project from a desktop browser if you are currently on a phone.
3. Check whether the project is still creating, paused, restoring, or restarting.
4. Check your Supabase role. Owner or Administrator access is the safest setup role.

If someone else created the Supabase project, ask them to make you an Owner or Administrator, or have them run `supabase/schema.sql` for you.

## Why the app cannot create the schema by itself

The Netlify Functions use `SUPABASE_SERVICE_ROLE_KEY` to read and write data after the tables exist. That key works through the Supabase REST API, which does not create brand-new database tables. The first schema install still has to run through SQL Editor, Supabase CLI, `psql`, or another direct Postgres connection.

## Fallback option: direct database connection

If SQL Editor stays disabled, use Supabase's database connection string:

1. Supabase Dashboard -> Project Settings -> Database.
2. Find the connection string for the project database.
3. Run the SQL file from this project against that connection:

```bash
psql "YOUR_SUPABASE_DATABASE_CONNECTION_STRING" -f supabase/schema.sql
```

Do not paste the database password or service-role key into public chat, screenshots, frontend files, or GitHub.

## After the schema is installed

Add these Netlify environment variables and redeploy:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
ADMIN_SESSION_SECRET=make-this-a-long-random-secret
ADMIN_SETUP_KEY=make-this-another-long-random-secret
```

Then open:

```text
https://YOUR-SITE.netlify.app/setup-admin
```

Use `ADMIN_SETUP_KEY` to create your first admin login.

If `/setup-admin` says the schema is not installed, Supabase is connected but the tables are still missing. Run `supabase/schema.sql` through SQL Editor, Supabase CLI, `psql`, or ask the project Owner/Administrator to run it.
