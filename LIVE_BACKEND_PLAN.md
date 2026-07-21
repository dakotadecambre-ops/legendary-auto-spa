# Legendary Auto Spa Live Backend Plan

## What the current app is

The current project is a customer-facing PWA with Netlify Function backend code, Supabase schema, admin dashboard, notification hooks, and Stripe Payment Element support. It still needs a real Netlify deployment plus Supabase, Stripe, Resend, and Twilio environment variables before it is truly live for customers.

## What this live customer/admin system needs

1. Customer app
   - Hosted on a public HTTPS domain.
   - Customer selects package, focus area, date/time, location, vehicle details, and payment preference.
   - Customer request is submitted to a secure API, with SMS/email fallback only when the backend is not configured.

2. Backend API
   - Receives booking requests.
   - Validates required fields.
   - Saves every request to a database.
   - Sends notifications to admins by email, SMS, or dashboard alert.
   - Creates payment or pre-authorization sessions with Stripe/Square.

3. Database
   - Stores customers, vehicles, booking requests, service package, focus area, location, status, assigned detailer, payment status, timestamps, and notes.
   - Recommended options: Supabase Postgres, Firebase, Neon Postgres, or a hosted Postgres database.

4. Admin app
   - Login required.
   - Admins can see all requests, customer info, vehicle info, package, focus area, payment status, notes, and request history.
   - Admins can update status: New, Contacted, Scheduled, In Progress, Complete, Canceled.
   - Optional: assign requests to staff, add private notes, export jobs, and view revenue.

5. Authentication
   - Admin accounts should use email/password or Google login.
   - Use role-based permissions if multiple people need access.
   - Do not share one Netlify login between multiple people.

6. Payments
   - Do not collect raw credit-card numbers in this app.
   - Use Stripe Payment Element, Stripe Checkout, Square Web Payments, or another PCI-compliant provider.
   - For pre-authorization, create a payment intent/session on the server with manual capture.
   - Apple Pay requires HTTPS and a registered payment domain with the payment provider.

7. Hosting
   - Static customer app: Netlify, Vercel, Cloudflare Pages, or similar.
   - Backend: Netlify Functions, Supabase Edge Functions, Vercel Serverless Functions, Render, Railway, or Fly.io.
   - Database/Auth: Supabase is a practical all-in-one option for this project.

## Practical recommended stack

- Frontend: current HTML/CSS/JS or migrate to React when the admin app is added.
- Backend/API: Supabase or Netlify Functions.
- Database/Auth/Admin login: Supabase.
- Payments: Stripe Payment Element with Apple Pay enabled.
- Notifications: Resend for email, Twilio for SMS.
- Hosting: Netlify with a custom domain.

## Production milestone path

1. Deploy this folder to Netlify.
2. Create the Supabase project and run `supabase/schema.sql`.
3. Add all required Netlify environment variables.
4. Create the first approved admin user.
5. Configure Resend/Twilio notification credentials.
6. Configure Stripe test-mode payments and webhook.
7. Register the live domain in Stripe and enable Apple Pay.
8. Test customer request, admin dashboard, notification, pre-authorization, webhook, and capture end-to-end.
9. Switch Stripe and notification providers to live mode.

## Environment variables for this project

Set these in Netlify under Site configuration > Environment variables:

- `SUPABASE_URL`: Your Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only Supabase service role key.
- `PUBLIC_SITE_URL`: Optional public site URL used in admin notification links.
- `ADMIN_SESSION_SECRET`: Long random string used to sign admin sessions.
- `ADMIN_SETUP_KEY`: Long random string used once to create approved admin users.
- `STRIPE_PUBLISHABLE_KEY`: Browser-safe Stripe key for Payment Element.
- `STRIPE_SECRET_KEY`: Optional at first; needed for payment holds.
- `STRIPE_WEBHOOK_SECRET`: Needed for Stripe payment status updates.
- `STRIPE_WEBHOOK_TOLERANCE_SECONDS`: Optional Stripe webhook timestamp tolerance, defaults to `300`.
- `STRIPE_CURRENCY`: Optional, defaults to `usd`.
- `DEFAULT_PREAUTH_AMOUNT_CENTS`: Optional; override the package starting price for authorization holds.
- `RESEND_API_KEY`: Optional email notifications.
- `ADMIN_EMAIL_FROM`: Optional, for example `Legendary Auto Spa <bookings@yourdomain.com>`.
- `ADMIN_EMAIL_TO`: Optional comma-separated admin emails.
- `TWILIO_ACCOUNT_SID`: Optional SMS notifications.
- `TWILIO_AUTH_TOKEN`: Optional SMS notifications.
- `TWILIO_FROM_NUMBER`: Optional SMS notifications.
- `ADMIN_SMS_TO`: Optional admin phone number for SMS alerts.

## Included live-ready files

- `netlify/functions/create-booking.js`: receives customer booking requests.
- `netlify/functions/create-test-booking.js`: lets an authenticated admin create a realistic sample booking for live testing.
- `netlify/functions/admin-login.js`: creates an admin session token.
- `netlify/functions/setup-admin-user.js`: creates the first owner admin with `ADMIN_SETUP_KEY`, then refuses additional bootstrap users.
- `netlify/functions/admin-users.js`: lets a logged-in admin list, create, update, deactivate, and reset passwords for approved admin users.
- `netlify/functions/admin-bookings.js`: returns booking records plus linked customer, vehicle, service location, and job records for admins.
- `netlify/functions/admin-events.js`: returns recent booking activity and notification history for admins.
- `netlify/functions/send-test-notification.js`: lets an admin/manager verify Resend/Twilio without creating a fake booking.
- `netlify/functions/update-booking.js`: lets admins update status, payment status, assignment, and private notes.
- `netlify/functions/stripe-webhook.js`: receives Stripe payment status events.
- `netlify/functions/capture-payment.js`: lets an authenticated admin capture an authorized payment.
- `netlify/functions/public-config.js`: exposes browser-safe Stripe publishable config.
- `netlify/functions/health.js`: checks live backend readiness for authenticated admins.
- `admin.html`, `admin.css`, `admin.js`: admin dashboard.
- `setup-admin.html`, `setup-admin.js`: browser form for creating the first approved admin with `ADMIN_SETUP_KEY`.
- `supabase/schema.sql`: database tables, indexes, constraints, policies, and health-check view for bookings, customers, vehicles, service locations, jobs, booking activity, and admin users.
- `netlify.toml`: Netlify deploy configuration.

## Create and update approved admin users

After Supabase is configured and deployed, create the first admin at:

```text
https://YOUR-SITE.netlify.app/setup-admin
```

Enter:

- Setup key: the `ADMIN_SETUP_KEY` value from Netlify environment variables.
- Admin email: the email you want to use at `/admin`.
- Admin password: at least 10 characters.
- Role: `admin`.

You can also create the first admin with the setup endpoint directly:

```bash
curl -X POST https://YOUR-SITE.netlify.app/.netlify/functions/setup-admin-user \
  -H "content-type: application/json" \
  -d '{
    "setup_key": "YOUR_ADMIN_SETUP_KEY",
    "email": "admin@example.com",
    "password": "a-long-secure-password",
    "role": "admin"
  }'
```

Then that admin can log in at `/admin` using their own email and password.

After the first login, use the Admin Users panel inside `/admin` to add your partner, reset passwords, change roles, or deactivate access. Do not share your Netlify login for day-to-day admin access. The `/setup-admin` page is only for initial bootstrap.

Admin endpoints verify the token and then reload the current Supabase `admin_users` row for that email. Deactivation and role changes take effect immediately, even if the browser still has an old token. The admin-user API also refuses to downgrade or deactivate the last active `admin` owner, so you cannot accidentally lock the team out of owner access.

Role permissions are enforced in the Netlify Functions:

- `admin`: can view bookings/activity, update bookings, create test bookings, manage admin users, and capture Stripe payments.
- `manager`: can view bookings/activity, update bookings, and create test bookings.
- `viewer`: can view bookings/activity only.

## Activity and notification history

Every saved request writes a `booking_created` event to `booking_events`. Email/SMS notification attempts also write success, warning, or error events. The `/admin` Activity Feed reads from `netlify/functions/admin-events.js`, so admins can see whether the backend received the request and whether notifications were sent. Skipped notification events include the missing environment variables, and successful notification events show provider IDs when available. Admins/managers can also use the Send test notification button to verify Resend/Twilio without creating another booking.

The public booking form includes a hidden honeypot field and a minimum form-fill time check. `netlify/functions/create-booking.js` rejects obvious bot submissions before creating database rows or sending notifications. It also checks for very recent bookings from the same phone number and returns a rate-limit response before charging, saving, or notifying. Tune the duplicate window with `BOOKING_RATE_LIMIT_WINDOW_MS`.

The booking API also creates related `customers`, `vehicles`, `service_locations`, and `jobs` records after the main booking is saved. Admin status, assignment, private-note, payment webhook, and capture updates sync back into the matching `jobs` row.

After a successful backend save, the customer app shows a short booking reference derived from the saved Supabase booking ID. The admin dashboard keeps the full booking and linked record IDs.

## Stripe Apple Pay / card authorization

The customer app now requests a manual-capture PaymentIntent when the customer chooses pre-authorization or Apple Pay/card checkout. If `STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY` are configured, the customer sees Stripe Payment Element and can authorize the payment. The admin can capture an authorized payment from the dashboard.

If a customer chooses a payment option before Stripe is fully configured, the booking still saves to Supabase and the Activity Feed logs `payment_setup_required`. The customer sees that payment will be handled after review, which avoids duplicate SMS fallbacks after a successful booking.

Configure the Stripe webhook endpoint as:

```text
https://YOUR-SITE.netlify.app/.netlify/functions/stripe-webhook
```

Subscribe it to these PaymentIntent events:

- `payment_intent.amount_capturable_updated`
- `payment_intent.succeeded`
- `payment_intent.canceled`
- `payment_intent.payment_failed`

Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

Apple Pay requires:

- HTTPS live site.
- Stripe wallet payment methods enabled.
- Your live domain registered in Stripe payment method domains.
- Safari/iOS environment with Apple Pay available.

## Live readiness check

After deployment, log in to `/admin` and review the System Status panel. It checks:

- Netlify Functions runtime.
- Supabase configuration plus required table and column readiness for bookings, customers, vehicles, service locations, jobs, activity logs, and admin users.
- Supabase database constraints for booking statuses, payment statuses, and admin roles.
- Admin auth/session configuration.
- Stripe publishable/secret key setup.
- Stripe webhook secret.
- Email notification settings.
- SMS notification settings.
