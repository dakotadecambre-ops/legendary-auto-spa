# Legendary Auto Spa Deploy Checklist

Use this when you are ready to make the customer app and admin backend live.

## Netlify

- Use `GITHUB_NETLIFY_STEPS.md` if the live site is stale or functions return 404.
- Deploy this folder or `legendary-auto-spa-app.zip`.
- Confirm `/build-info.json` shows the latest build label.
- Confirm `/` opens the customer app.
- Confirm `/admin` opens the admin login.
- Confirm `/deployment-check` shows all required files/functions as found.
- Or run `sh scripts/check-live-deploy.sh` from this folder.
- Add all environment variables from `.env.example`.

## Supabase

- Create a Supabase project.
- Run `supabase/schema.sql` in the Supabase SQL editor.
- Re-run `supabase/schema.sql` after app updates; it safely adds missing columns, constraints, indexes, policies, and the health-check view.
- If SQL Editor is greyed out, use `SUPABASE_SQL_EDITOR_BLOCKED.md` for the permission checks and direct database fallback.
- Copy `SUPABASE_URL` into Netlify.
- Copy the server-only service role key into `SUPABASE_SERVICE_ROLE_KEY`.
- Add `PUBLIC_SITE_URL` if you want notification links to use your custom domain.
- Never put the service role key in browser JavaScript.

## Admin Access

- Set `ADMIN_SESSION_SECRET` to a long random string.
- Set `ADMIN_SETUP_KEY` to a different long random string.
- Create the first admin at `/setup-admin` using your `ADMIN_SETUP_KEY`.
- After first login, add partners from the Admin Users panel in `/admin`.
- Treat `/setup-admin` as bootstrap-only; do not use it for partner accounts.
- Use `admin` for owners, `manager` for staff who can update bookings, and `viewer` for read-only access.
- Keep at least one active `admin`; the backend blocks removing the final active owner.
- Confirm deactivated or downgraded users lose access immediately by refreshing `/admin`.
- Do not share your Netlify login for day-to-day admin access.

## Square

- Add `SQUARE_APPLICATION_ID`, `SQUARE_LOCATION_ID`, `SQUARE_ACCESS_TOKEN`, and `SQUARE_ENVIRONMENT`.
- Add webhook endpoint:

```text
https://YOUR-SITE.netlify.app/.netlify/functions/square-webhook
```

- Subscribe to Square payment update events.
- Copy the webhook signature key into `SQUARE_WEBHOOK_SIGNATURE_KEY`.
- Set `SQUARE_WEBHOOK_URL` to the exact webhook URL if Square signature checks fail.
- Register the live domain for Apple Pay in the Square Developer Console.
- Test a pre-authorized payment before switching to live mode.

## Notifications

- Add Resend variables for email alerts.
- Add Twilio variables for SMS alerts.
- Use `/admin` > Send test notification and confirm the Activity Feed logs notification success or failure.
- Submit one test booking if you also want to verify booking-created notifications.

## Final Test

- Submit a customer request.
- Confirm it appears in `/admin`.
- Or use `/admin` > Create test booking to verify the backend before real customers submit.
- Confirm `customers`, `vehicles`, `service_locations`, `jobs`, and `booking_events` rows are created in Supabase.
- Confirm `/admin` > System Status shows Supabase constraints as installed.
- Update status/assignment/private notes from `/admin`.
- Confirm the matching `jobs` row updates.
- Authorize a Square payment.
- Confirm Square webhook updates payment status.
- Capture payment from `/admin`.
