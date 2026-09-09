create table public.smartlink_requests (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  source_type public.source_type not null,
  is_test boolean not null default false,
  plaque_id uuid references public.plaques(id) on delete set null,
  destination_id uuid references public.destinations(id) on delete set null,
  active_destination_count integer not null default 0,
  device_family text,
  outcome text not null default 'received',
  interaction_event_id uuid references public.events(id) on delete set null,
  redirect_url text,
  build_id text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
grant all on public.smartlink_requests to service_role;
alter table public.smartlink_requests enable row level security;

create index smartlink_requests_plaque_requested_idx
  on public.smartlink_requests (plaque_id, requested_at desc);
create index smartlink_requests_slug_requested_idx
  on public.smartlink_requests (slug, requested_at desc);
create index smartlink_requests_outcome_requested_idx
  on public.smartlink_requests (outcome, requested_at desc);

create table public.smartlink_failures (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.smartlink_requests(id) on delete set null,
  plaque_id uuid references public.plaques(id) on delete set null,
  slug text not null,
  source_type public.source_type not null,
  stage text not null,
  error_code text,
  error_message text not null,
  error_details text,
  error_hint text,
  created_at timestamptz not null default now()
);
grant all on public.smartlink_failures to service_role;
alter table public.smartlink_failures enable row level security;

create index smartlink_failures_plaque_created_idx
  on public.smartlink_failures (plaque_id, created_at desc);
create index smartlink_failures_request_idx
  on public.smartlink_failures (request_id);
create index smartlink_failures_slug_created_idx
  on public.smartlink_failures (slug, created_at desc);

create or replace function public.replace_current_destination(
  _plaque_id uuid,
  _business_id uuid,
  _destination_type public.destination_type,
  _url text,
  _metadata jsonb default '{}'::jsonb,
  _effective_at timestamptz default now()
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  _destination_id uuid;
begin
  if _plaque_id is null or _business_id is null or nullif(btrim(_url), '') is null then
    raise exception 'Plaque, business, and URL are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_plaque_id::text, 0));

  update public.destinations
  set active = false,
      effective_to = _effective_at
  where plaque_id = _plaque_id
    and effective_to is null;

  insert into public.destinations (
    business_id,
    plaque_id,
    destination_type,
    url,
    metadata,
    active,
    effective_from
  ) values (
    _business_id,
    _plaque_id,
    _destination_type,
    btrim(_url),
    coalesce(_metadata, '{}'::jsonb),
    true,
    _effective_at
  )
  returning id into _destination_id;

  return _destination_id;
end;
$$;
revoke all on function public.replace_current_destination(uuid, uuid, public.destination_type, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.replace_current_destination(uuid, uuid, public.destination_type, text, jsonb, timestamptz) to service_role;

create unique index destinations_one_active_current_per_plaque_idx
  on public.destinations (plaque_id)
  where plaque_id is not null and active = true and effective_to is null;