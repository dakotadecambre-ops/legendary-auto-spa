# Legendary Auto Spa

A mobile-first booking app for Legendary Auto Spa. Customers can choose a detail tier, enter contact details, add vehicle information, provide a service location, pick a preferred time window, and hand the request off by text or email.

## Run Locally

```bash
python3 -m http.server 8002 --bind 0.0.0.0
```

Then open `http://localhost:8002` on the computer.

To open it from your phone while your computer and phone are on the same Wi-Fi, use your computer's local network address, for example:

```text
http://192.168.86.202:8002
```

If port `8002` is already being used, change the port number:

```bash
python3 -m http.server 8003 --bind 0.0.0.0
```

Then open:

```text
http://192.168.86.202:8003
```

## Customize

Update these constants in `app.js` before publishing:

```js
const BUSINESS_PHONE = "+12016652625";
const BUSINESS_PHONE_DISPLAY = "201-665-2625";
```

Package names, flyer pricing, and add-ons live in the service cards in `index.html`. The app uses car/SUV/truck prices from those cards and updates the booking summary after vehicle size is selected. If the backend is not configured yet, mobile customers get an SMS draft to the Legendary Auto Spa number from the flyer.

## Publish Options

- Web bookmark / installable app: host this folder on Netlify, Vercel, Cloudflare Pages, or GitHub Pages. The included manifest and service worker make it installable as a PWA.
- Public app stores: wrap the hosted app with Capacitor, Bubblewrap, or a native WebView shell, then submit it to the Apple App Store or Google Play.
- Production requests: deploy the included Netlify Functions and configure Supabase so customer requests save to the backend instead of using only the SMS/email fallback.

## Admin and Backend

This project now includes Netlify Functions and an admin dashboard shell.

- Customer app: `index.html`
- Admin dashboard: `/admin` or `admin.html`
- First admin setup: `/setup-admin` or `setup-admin.html`
- Deployment check: `/deployment-check` or `deployment-check.html`
- Build/version check: `/build-info.json`
- Backend deploy marker: `/.netlify/functions/deploy-marker`
- Database schema: `supabase/schema.sql`
- Setup notes: `LIVE_BACKEND_PLAN.md`
- Launch checklist: `DEPLOY_CHECKLIST.md`
- GitHub/Netlify steps: `GITHUB_NETLIFY_STEPS.md`
- Current live status: `CURRENT_LIVE_STATUS.md`
- SQL Editor fallback: `SUPABASE_SQL_EDITOR_BLOCKED.md`

The schema stores each request in `bookings` for the admin dashboard and also writes related `customers`, `vehicles`, `service_locations`, and `jobs` records for a cleaner production backend. The admin booking cards show the linked backend records so you can confirm a request created the full data set. Re-run `supabase/schema.sql` after app updates; it safely adds missing columns, indexes, constraints, policies, and the health-check view.

The admin/backend pieces require Supabase and Netlify environment variables before they are live.

Create the first approved owner admin account at `/setup-admin` after setting `ADMIN_SETUP_KEY`. After the first admin exists, add partners from `/admin`; `/setup-admin` will refuse additional bootstrap users.

If the setup page looks like it submits but nothing happens, open `/deployment-check` on the live Netlify domain. It checks whether the browser can actually load the setup JavaScript and the required Netlify Functions from that deployment.

After a correct Netlify deploy, `/build-info.json` and `/.netlify/functions/deploy-marker` should both show `live-backend-admin-setup`. If `/deployment-check`, `/build-info.json`, or `/.netlify/functions/...` returns a Netlify 404 page, use `NETLIFY_DEPLOY_FIX.md` to confirm the GitHub repo root and Netlify build settings.

You can also run `sh scripts/check-live-deploy.sh` from this folder after a Netlify redeploy to confirm the live URL is serving the current build and functions.

If Node is installed, the same checks are available as `npm run check:source` and `npm run check:live`. A manual Netlify CLI production deploy command is available as `npm run deploy:netlify`.

After login, `/admin` includes a System Status panel showing which backend pieces are ready and which still need configuration. It also includes an Admin Users panel where you can add a partner, reset a password, change a role, or deactivate an account without sharing your Netlify login. Roles are enforced by the backend against the current Supabase admin user record, so deactivation and role changes take effect immediately. `admin` can manage users and capture payments, `manager` can update bookings and run test bookings/notifications, and `viewer` can read the dashboard without editing. The backend refuses changes that would leave zero active admin owners. The Activity Feed shows backend booking events and notification results.
