# GitHub + Netlify Setup Steps

Use this path for the live Legendary Auto Spa app because it includes Netlify Functions for bookings, admin login, payments, and notifications.

## 1. Put The Correct Files In GitHub

In GitHub, the repository root must directly show:

```text
index.html
styles.css
app.js
setup-admin.html
setup-admin.js
admin.html
admin.css
admin.js
deployment-check.html
deployment-check.js
build-info.json
netlify.toml
netlify/
supabase/
assets/
scripts/
```

If GitHub shows one folder first, such as `legendary-auto-spa-app/`, and the files are inside that folder, Netlify is probably deploying the wrong root.

Before pushing, you can verify the local source root with:

```bash
sh scripts/check-source-root.sh
```

Or, if using npm:

```bash
npm run check:source
```

## 2. Connect That Repo To Netlify

In Netlify:

```text
Add new project
Import an existing project
GitHub
Choose the Legendary Auto Spa repo
```

Use these build settings:

```text
Base directory: blank
Build command: blank
Publish directory: .
Functions directory: netlify/functions
Node version: 20
```

The project also has `netlify.toml` with:

```toml
[build]
  publish = "."
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "20"
```

## 3. Add Required Environment Variables

For first admin setup, add these in Netlify:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_SESSION_SECRET
ADMIN_SETUP_KEY
```

Do not add your admin email/password to Netlify. Those are created at `/setup-admin`.

## 4. Deploy And Verify

After Netlify finishes deploying, open:

```text
https://legendaryautospa.netlify.app/build-info.json?fresh=1
```

It must show:

```text
live-backend-admin-setup
```

Then open:

```text
https://legendaryautospa.netlify.app/deployment-check?fresh=1
```

Or run:

```bash
sh scripts/check-live-deploy.sh
```

Or:

```bash
npm run check:live
```

The deploy shape is correct only when the build marker, JavaScript files, and Netlify Functions pass.

After logging in, use `/admin` > Send test notification to verify Resend/Twilio and Activity Feed logging without creating a fake booking.

## Optional Manual Deploy With Netlify CLI

GitHub deploy is the cleaner path. If you need to manually push the current folder to the existing Netlify site from a computer with Node installed and Netlify logged in:

```bash
npm run deploy:netlify
```

That command publishes this root folder and the `netlify/functions` folder. It may ask you to log in or choose the Netlify site the first time.

## 5. Create The First Admin

After the deploy checker passes:

```text
https://legendaryautospa.netlify.app/setup-admin?fresh=1
```

Enter:

```text
Setup key: ADMIN_SETUP_KEY from Netlify
Email: your admin email
Password: your new admin password
Role: admin
```

Then log in:

```text
https://legendaryautospa.netlify.app/admin
```

## 6. Add Partner Access

After you log in as admin, use the Admin Users panel inside `/admin`.

Do not share the Netlify login for day-to-day use. Add your partner as `admin`, `manager`, or `viewer`. The `/setup-admin` route is only for creating the first owner admin.
