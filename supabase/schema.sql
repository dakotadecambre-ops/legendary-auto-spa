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
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
check (status in ('new', 'contacted', 'scheduled', 'in_progress', 'complete', 'canceled'));
alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings add constraint bookings_payment_status_check
check (payment_status in ('not_started', 'pending', 'requires_capture', 'succeeded', 'canceled', 'failed'));

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
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
check (status in ('new', 'contacted', 'scheduled', 'in_progress', 'complete', 'canceled'));
alter table public.jobs drop constraint if exists jobs_payment_status_check;
alter table public.jobs add constraint jobs_payment_status_check
check (payment_status in ('not_started', 'pending', 'requires_capture', 'succeeded', 'canceled', 'failed'));

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

alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check
check (role in ('admin', 'manager', 'viewer'));

create table if not exists public.member_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  email text,
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_accounts_phone_idx on public.member_accounts (phone);
create index if not exists member_accounts_email_idx on public.member_accounts (email);
create index if not exists member_accounts_active_idx on public.member_accounts (active);

create table if not exists public.member_vehicles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_accounts (id) on delete cascade,
  year text,
  make text not null,
  model text not null,
  size text not null,
  notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_vehicles_member_id_idx on public.member_vehicles (member_id);
create index if not exists member_vehicles_default_idx on public.member_vehicles (member_id, is_default);

create table if not exists public.member_locations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_accounts (id) on delete cascade,
  label text,
  address text not null,
  notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_locations_member_id_idx on public.member_locations (member_id);
create index if not exists member_locations_default_idx on public.member_locations (member_id, is_default);

create table if not exists public.member_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_accounts (id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists member_sessions_member_id_idx on public.member_sessions (member_id);
create index if not exists member_sessions_expires_at_idx on public.member_sessions (expires_at);

create or replace view public.legendary_member_schema_constraints as
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('member_accounts', 'member_vehicles', 'member_locations', 'member_sessions');

create or replace view public.legendary_schema_constraints as
select con.conname
from pg_constraint con
join pg_namespace nsp on nsp.oid = con.connamespace
where nsp.nspname = 'public'
  and con.conname in (
    'bookings_status_check',
    'bookings_payment_status_check',
    'jobs_status_check',
    'jobs_payment_status_check',
    'admin_users_role_check'
  );

alter table public.bookings enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.service_locations enable row level security;
alter table public.jobs enable row level security;
alter table public.booking_events enable row level security;
alter table public.admin_users enable row level security;
alter table public.member_accounts enable row level security;
alter table public.member_vehicles enable row level security;
alter table public.member_locations enable row level security;
alter table public.member_sessions enable row level security;

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

drop policy if exists "No direct anonymous member account access" on public.member_accounts;
create policy "No direct anonymous member account access"
on public.member_accounts
for all
using (false)
with check (false);

drop policy if exists "No direct anonymous member vehicle access" on public.member_vehicles;
create policy "No direct anonymous member vehicle access"
on public.member_vehicles
for all
using (false)
with check (false);

drop policy if exists "No direct anonymous member location access" on public.member_locations;
create policy "No direct anonymous member location access"
on public.member_locations
for all
using (false)
with check (false);

drop policy if exists "No direct anonymous member session access" on public.member_sessions;
create policy "No direct anonymous member session access"
on public.member_sessions
for all
using (false)
with check (false);

-- Netlify Functions use SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
-- Do not expose SUPABASE_SERVICE_ROLE_KEY in browser JavaScript.
