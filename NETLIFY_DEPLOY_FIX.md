# Netlify Deploy Fix

Use this when the live site opens, but `/setup-admin` submits without working or any `/.netlify/functions/...` URL shows Netlify's 404 page.

For the exact GitHub setup flow, use `GITHUB_NETLIFY_STEPS.md`.

## What This Means

If a function URL like this returns a Netlify 404 page:

```text
https://legendaryautospa.netlify.app/.netlify/functions/setup-admin-user
```

Netlify is not deploying the `netlify/functions` folder from this project. That is a deploy-source problem, not an `ADMIN_SETUP_KEY` problem.

## Files That Must Be In The GitHub Repo Root

The root of the GitHub repo connected to Netlify should show these files/folders directly:

```text
index.html
app.js
styles.css
setup-admin.html
setup-admin.js
admin.html
admin.js
admin.css
deployment-check.html
deployment-check.js
build-info.json
netlify.toml
netlify/
supabase/
assets/
```

Do not put this project inside another folder unless Netlify's base directory is set to that folder.

## Netlify Build Settings

For this static app, use:

```text
Base directory: blank
Build command: blank
Publish directory: .
Functions directory: netlify/functions
Node version: 20
```

The included `netlify.toml` already says:

```toml
[build]
  publish = "."
  functions = "netlify/functions"
```

## Required Environment Variables For First Admin Setup

Only these four are required before creating your first admin login:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_SESSION_SECRET
ADMIN_SETUP_KEY
```

Your admin email and password do not go in Netlify environment variables. They are entered at `/setup-admin` after the schema is installed in Supabase.

## After Redeploy

Open these in order:

```text
https://legendaryautospa.netlify.app/build-info.json?fresh=1
https://legendaryautospa.netlify.app/deployment-check?fresh=1
https://legendaryautospa.netlify.app/.netlify/functions/public-config
```

Expected:

- `build-info.json` should show `live-backend-admin-setup`.
- `/deployment-check` should load the diagnostic page.
- `public-config` should return JSON, not a Netlify 404 page.

If `build-info.json` is 404, the current project files are not in the deployed repo root.
If `build-info.json` works but functions are 404, the `netlify/functions` folder or `netlify.toml` is missing from the deployed repo root.

## Command Line Smoke Test

From this project folder, you can also run:

```bash
sh scripts/check-source-root.sh
```

That checks whether the local/GitHub root has the required files in the right place.

After deploying, run:

```bash
sh scripts/check-live-deploy.sh
```

Or:

```bash
npm run check:live
```

Or for another Netlify URL:

```bash
sh scripts/check-live-deploy.sh https://your-site.netlify.app
```

It checks the build marker, setup/admin JavaScript, and required Netlify Functions.
