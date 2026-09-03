-- ENUMS
create type public.app_role as enum ('admin','moderator','user');
create type public.member_role as enum ('owner','admin','manager','viewer');
create type public.plaque_status as enum ('inventory','packed','sold','claimed','active','paused','faulty','replaced','retired');
create type public.destination_type as enum ('google_review','instagram','facebook','website','menu','booking','directions','call','quote','coupon','loyalty','custom');
create type public.event_type as enum ('interaction','redirect_success','redirect_failure','lead_started','lead_submitted','coupon_claimed','coupon_redeemed','booking_started','booking_completed','custom_conversion');
create type public.source_type as enum ('nfc','qr');
create type public.intent_type as enum ('review','social','menu','booking','lead','directions','website','promotion','loyalty','custom');
create type public.attribution_type as enum ('direct','correlated','unknown');
create type public.recommendation_status as enum ('new','viewed','accepted','rejected','expired');
create type public.initiated_by as enum ('owner','copilot','admin','automation');

-- USER ROLES (platform admin)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

-- PROFILES
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- BUSINESSES
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text not null default 'other',
  timezone text not null default 'America/Toronto',
  primary_goal text,
  status text not null default 'active',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.businesses to authenticated;
grant select on public.businesses to anon;
grant all on public.businesses to service_role;
alter table public.businesses enable row level security;

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'owner',
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);
grant select, insert, update, delete on public.business_members to authenticated;
grant all on public.business_members to service_role;
alter table public.business_members enable row level security;

create or replace function public.is_business_member(_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members
    where business_id = _business_id and user_id = auth.uid()
  ) or exists (
    select 1 from public.businesses where id = _business_id and is_demo = true
  )
$$;

create policy "members read business" on public.businesses for select to authenticated using (public.is_business_member(id));
create policy "anon read demo business" on public.businesses for select to anon using (is_demo = true);
create policy "members update business" on public.businesses for update to authenticated using (public.is_business_member(id) and is_demo = false);
create policy "authenticated create business" on public.businesses for insert to authenticated with check (true);

create policy "read own memberships" on public.business_members for select to authenticated using (user_id = auth.uid() or public.is_business_member(business_id));
create policy "insert own membership" on public.business_members for insert to authenticated with check (user_id = auth.uid());

-- LOCATIONS
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  address text,
  city text,
  province_state text,
  country text,
  timezone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.locations to authenticated;
grant select on public.locations to anon;
grant all on public.locations to service_role;
alter table public.locations enable row level security;
create policy "members manage locations" on public.locations for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "anon read demo locations" on public.locations for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.is_demo));

-- PLAQUES
create table public.plaques (
  id uuid primary key default gen_random_uuid(),
  plaque_code text not null unique,
  public_slug text not null unique,
  activation_token_hash text,
  business_id uuid references public.businesses(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  product_type text not null default 'generic',
  style text,
  base_type text,
  sku text,
  plaque_name text,
  placement_type text,
  status plaque_status not null default 'inventory',
  activated_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.plaques to authenticated;
grant select on public.plaques to anon;
grant all on public.plaques to service_role;
alter table public.plaques enable row level security;
create policy "members manage plaques" on public.plaques for all to authenticated
  using (business_id is not null and public.is_business_member(business_id))
  with check (business_id is not null and public.is_business_member(business_id));
create policy "anon read demo plaques" on public.plaques for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.is_demo));
create policy "admins manage plaques" on public.plaques for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- GOALS
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  goal_type text not null,
  priority int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.goals to authenticated;
grant select on public.goals to anon;
grant all on public.goals to service_role;
alter table public.goals enable row level security;
create policy "members manage goals" on public.goals for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "anon read demo goals" on public.goals for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.is_demo));

-- DESTINATIONS
create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plaque_id uuid references public.plaques(id) on delete cascade,
  destination_type destination_type not null,
  url text not null,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.destinations to authenticated;
grant select on public.destinations to anon;
grant all on public.destinations to service_role;
alter table public.destinations enable row level security;
create policy "members manage destinations" on public.destinations for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "anon read demo destinations" on public.destinations for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.is_demo));

-- PLACEMENT HISTORY
create table public.plaque_placement_history (
  id uuid primary key default gen_random_uuid(),
  plaque_id uuid not null references public.plaques(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  placement_type text,
  placement_name text,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  changed_by_user_id uuid,
  reason text
);
grant select, insert, update, delete on public.plaque_placement_history to authenticated;
grant select on public.plaque_placement_history to anon;
grant all on public.plaque_placement_history to service_role;
alter table public.plaque_placement_history enable row level security;
create policy "members manage placement history" on public.plaque_placement_history for all to authenticated
  using (exists (select 1 from public.plaques p where p.id = plaque_id and p.business_id is not null and public.is_business_member(p.business_id)))
  with check (exists (select 1 from public.plaques p where p.id = plaque_id and p.business_id is not null and public.is_business_member(p.business_id)));
create policy "anon read demo placement history" on public.plaque_placement_history for select to anon
  using (exists (select 1 from public.plaques p join public.businesses b on b.id = p.business_id where p.id = plaque_id and b.is_demo));

-- EVENTS
create table public.events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  plaque_id uuid references public.plaques(id) on delete set null,
  event_type event_type not null default 'interaction',
  source_type source_type,
  intent_type intent_type,
  destination_type destination_type,
  destination_id uuid references public.destinations(id) on delete set null,
  device_family text,
  browser_family text,
  coarse_country text,
  coarse_region text,
  anonymous_visitor_key text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index events_business_time_idx on public.events (business_id, occurred_at desc);
create index events_plaque_time_idx on public.events (plaque_id, occurred_at desc);
grant select, insert on public.events to authenticated;
grant select on public.events to anon;
grant all on public.events to service_role;
alter table public.events enable row level security;
create policy "members read events" on public.events for select to authenticated using (business_id is not null and public.is_business_member(business_id));
create policy "anon read demo events" on public.events for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.is_demo));

-- INTEGRATIONS
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  integration_type text not null,
  external_account_id text,
  status text not null default 'disconnected',
  scopes text[],
  credentials_reference text,
  connected_at timestamptz,
  last_sync_at timestamptz
);
grant select, insert, update, delete on public.integrations to authenticated;
grant select on public.integrations to anon;
grant all on public.integrations to service_role;
alter table public.integrations enable row level security;
create policy "members manage integrations" on public.integrations for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "anon read demo integrations" on public.integrations for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.is_demo));

-- METRIC SNAPSHOTS
create table public.metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  integration_id uuid references public.integrations(id) on delete set null,
  metric_type text not null,
  metric_value numeric not null,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
grant select, insert, update, delete on public.metric_snapshots to authenticated;
grant select on public.metric_snapshots to anon;
grant all on public.metric_snapshots to service_role;
alter table public.metric_snapshots enable row level security;
create policy "members manage snapshots" on public.metric_snapshots for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "anon read demo snapshots" on public.metric_snapshots for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.is_demo));

-- OUTCOMES
create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plaque_id uuid references public.plaques(id) on delete set null,
  destination_id uuid references public.destinations(id) on delete set null,
  outcome_type text not null,
  attribution_type attribution_type not null default 'direct',
  value numeric,
  external_id text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
grant select, insert, update, delete on public.outcomes to authenticated;
grant select on public.outcomes to anon;
grant all on public.outcomes to service_role;
alter table public.outcomes enable row level security;
create policy "members manage outcomes" on public.outcomes for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "anon read demo outcomes" on public.outcomes for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.is_demo));

-- EXPERIMENTS
create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  hypothesis text,
  experiment_type text not null default 'placement',
  primary_goal text,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by_user_id uuid
);
grant select, insert, update, delete on public.experiments to authenticated;
grant select on public.experiments to anon;
grant all on public.experiments to service_role;
alter table public.experiments enable row level security;
create policy "members manage experiments" on public.experiments for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "anon read demo experiments" on public.experiments for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.is_demo));

create table public.experiment_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  plaque_id uuid references public.plaques(id) on delete set null,
  configuration jsonb not null default '{}'::jsonb,
  label text
);
grant select, insert, update, delete on public.experiment_variants to authenticated;
grant select on public.experiment_variants to anon;
grant all on public.experiment_variants to service_role;
alter table public.experiment_variants enable row level security;
create policy "members manage variants" on public.experiment_variants for all to authenticated
  using (exists (select 1 from public.experiments e where e.id = experiment_id and public.is_business_member(e.business_id)))
  with check (exists (select 1 from public.experiments e where e.id = experiment_id and public.is_business_member(e.business_id)));
create policy "anon read demo variants" on public.experiment_variants for select to anon
  using (exists (select 1 from public.experiments e join public.businesses b on b.id = e.business_id where e.id = experiment_id and b.is_demo));

-- RECOMMENDATIONS
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  recommendation_type text not null,
  title text not null,
  explanation text not null,
  evidence jsonb not null default '{}'::jsonb,
  proposed_action jsonb not null default '{}'::jsonb,
  confidence numeric,
  status recommendation_status not null default 'new',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
grant select, insert, update, delete on public.recommendations to authenticated;
grant select on public.recommendations to anon;
grant all on public.recommendations to service_role;
alter table public.recommendations enable row level security;
create policy "members manage recommendations" on public.recommendations for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "anon read demo recommendations" on public.recommendations for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.is_demo));

-- ACTION HISTORY
create table public.action_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plaque_id uuid references public.plaques(id) on delete set null,
  action_type text not null,
  previous_value jsonb,
  new_value jsonb,
  initiated_by initiated_by not null default 'owner',
  approved_by_user_id uuid,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.action_history to authenticated;
grant select on public.action_history to anon;
grant all on public.action_history to service_role;
alter table public.action_history enable row level security;
create policy "members manage action history" on public.action_history for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "anon read demo action history" on public.action_history for select to anon using (exists (select 1 from public.businesses b where b.id = business_id and b.is_demo));

-- CONVERSATIONS
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;
create policy "members manage conversations" on public.conversations for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null,
  content text not null default '',
  tool_calls jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.conversation_messages to authenticated;
grant all on public.conversation_messages to service_role;
alter table public.conversation_messages enable row level security;
create policy "members manage messages" on public.conversation_messages for all to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and public.is_business_member(c.business_id)))
  with check (exists (select 1 from public.conversations c where c.id = conversation_id and public.is_business_member(c.business_id)));

-- SUBSCRIPTIONS
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan text not null default 'starter',
  status text not null default 'active',
  started_at timestamptz not null default now(),
  renews_at timestamptz
);
grant select, insert, update, delete on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
create policy "members manage subscriptions" on public.subscriptions for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

-- updated_at trigger
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
create trigger businesses_touch before update on public.businesses for each row execute function public.touch_updated_at();
create trigger conversations_touch before update on public.conversations for each row execute function public.touch_updated_at();