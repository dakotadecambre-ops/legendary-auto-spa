# Current Live Status

Last checked: 2026-07-21 02:35 America/New_York

Live URL:

```text
https://legendaryautospa.netlify.app
```

Command run:

```bash
sh scripts/check-live-deploy.sh https://legendaryautospa.netlify.app
```

Result:

```text
0 passed, 10 failed
```

Failed live checks:

```text
build-info.json                         404
/deployment-check                       404
/setup-admin.js                         404
/admin.js                               404
/.netlify/functions/deploy-marker       404
/.netlify/functions/public-config       404
/.netlify/functions/setup-admin-user    404
/.netlify/functions/create-booking      404
/.netlify/functions/admin-login         404
/.netlify/functions/send-test-notification 404
```

Meaning:

Netlify is not deploying the current project root. This is not an `ADMIN_SETUP_KEY`, Supabase, Stripe, or code-runtime problem yet. The live site must first serve the current files from this folder.

The correct GitHub/Netlify source root directly contains:

```text
index.html
app.js
admin.js
setup-admin.js
build-info.json
deployment-check.html
netlify.toml
netlify/functions/
supabase/schema.sql
```

Next verification after redeploy:

```text
https://legendaryautospa.netlify.app/build-info.json?fresh=1
https://legendaryautospa.netlify.app/.netlify/functions/deploy-marker
```

Those URLs must show:

```text
live-backend-admin-setup
```

Only after that works should you continue to `/setup-admin`, `/admin`, Supabase checks, notifications, or Stripe tests.
