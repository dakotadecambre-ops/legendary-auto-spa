create extension if not exists pgcrypto;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  email text,
  vehicle_year text,
  vehicle_make text not null,
  vehicle_model text not null,
  vehicle_size text not null,
  service_tier text not null,
  starting_price text,
  focus_area text,
  focus_goal text,
  recommended_tier text,
  add_ons text,
  service_address text not null,
  preferred_date date,
  preferred_time text,
  notes text,
  payment_preference text,
  payment_status text not null default 'not_started',
  payment_intent_id text,
  status text not null default 'new',
  assigned_to text,
  private_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_created_at_idx on public.bookings (created_at desc);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_payment_status_idx on public.bookings (payment_status);
create index if not exists bookings_phone_idx on public.bookings (phone);

alter table public.bookings add column if not exists add_ons text;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_booking_id_idx on public.customers (booking_id);
create index if not exists customers_phone_idx on public.customers (phone);
create index if not exists customers_email_idx on public.customers (email);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  year text,
  make text not null,
  model text not null,
  size text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicles_booking_id_idx on public.vehicles (booking_id);
create index if not exists vehicles_customer_id_idx on public.vehicles (customer_id);

create table if not exists public.service_locations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  address text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_locations_booking_id_idx on public.service_locations (booking_id);
create index if not exists service_locations_customer_id_idx on public.service_locations (customer_id);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid unique references public.bookings (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  service_location_id uuid references public.service_locations (id) on delete set null,
  service_tier text not null,
  starting_price text,
  focus_area text,
  focus_goal text,
  recommended_tier text,
  add_ons text,
  preferred_date date,
  preferred_time text,
  status text not null default 'new',
  assigned_to text,
  payment_status text not null default 'not_started',
  payment_intent_id text,
  private_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_booking_id_idx on public.jobs (booking_id);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_payment_status_idx on public.jobs (payment_status);

alter table public.jobs add column if not exists add_ons text;

create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id) on delete cascade,
  event_type text not null,
  channel text,
  status text not null default 'info',
  message text,
  details jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists booking_events_booking_id_idx on public.booking_events (booking_id);
create index if not exists booking_events_created_at_idx on public.booking_events (created_at desc);
create index if not exists booking_events_event_type_idx on public.booking_events (event_type);

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'admin',
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_users_email_idx on public.admin_users (email);
create index if not exists admin_users_active_idx on public.admin_users (active);

alter table public.bookings enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.service_locations enable row level security;
alter table public.jobs enable row level security;
alter table public.booking_events enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "No direct anonymous booking access" on public.bookings;
create policy "No direct anonymous booking access"
on public.bookings
for all
using (false)
with check (false);

drop policy if exists "No direct anonymous customer access" on public.customers;
create policy "No direct anonymous customer access"
on public.customers
for all
using (false)
with check (false);

drop policy if exists "No direct anonymous vehicle access" on public.vehicles;
create policy "No direct anonymous vehicle access"
on public.vehicles
for all
using (false)
with check (false);

drop policy if exists "No direct anonymous service location access" on public.service_locations;
create policy "No direct anonymous service location access"
on public.service_locations
for all
using (false)
with check (false);

drop policy if exists "No direct anonymous job access" on public.jobs;
create policy "No direct anonymous job access"
on public.jobs
for all
using (false)
with check (false);

drop policy if exists "No direct anonymous booking event access" on public.booking_events;
create policy "No direct anonymous booking event access"
on public.booking_events
for all
using (false)
with check (false);

drop policy if exists "No direct anonymous admin user access" on public.admin_users;
create policy "No direct anonymous admin user access"
on public.admin_users
for all
using (false)
with check (false);

-- Netlify Functions use SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
-- Do not expose SUPABASE_SERVICE_ROLE_KEY in browser JavaScript.
