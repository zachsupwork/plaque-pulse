-- Locations: real Google listing data
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS google_place_id text,
  ADD COLUMN IF NOT EXISTS google_maps_uri text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS google_rating numeric,
  ADD COLUMN IF NOT EXISTS google_review_count integer,
  ADD COLUMN IF NOT EXISTS google_business_status text,
  ADD COLUMN IF NOT EXISTS google_primary_type text,
  ADD COLUMN IF NOT EXISTS public_data_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

CREATE INDEX IF NOT EXISTS locations_google_place_id_idx ON public.locations (google_place_id);
CREATE UNIQUE INDEX IF NOT EXISTS locations_business_place_unique
  ON public.locations (business_id, google_place_id)
  WHERE google_place_id IS NOT NULL;

-- Plaques: configured-before-claimed lifecycle
ALTER TYPE plaque_status ADD VALUE IF NOT EXISTS 'configured_unclaimed';

ALTER TABLE public.plaques
  ADD COLUMN IF NOT EXISTS configured_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by_user_id uuid;

-- Packs
CREATE TABLE IF NOT EXISTS public.plaque_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_code text NOT NULL UNIQUE,
  activation_token_hash text,
  status text NOT NULL DEFAULT 'inventory',
  business_id uuid REFERENCES public.businesses(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz
);

GRANT SELECT ON public.plaque_packs TO authenticated;
GRANT ALL ON public.plaque_packs TO service_role;
ALTER TABLE public.plaque_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their packs" ON public.plaque_packs
  FOR SELECT TO authenticated
  USING (business_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.business_members m
    WHERE m.business_id = plaque_packs.business_id AND m.user_id = auth.uid()
  ));

CREATE TABLE IF NOT EXISTS public.pack_plaques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.plaque_packs(id) ON DELETE CASCADE,
  plaque_id uuid NOT NULL REFERENCES public.plaques(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pack_id, plaque_id)
);

GRANT SELECT ON public.pack_plaques TO authenticated;
GRANT ALL ON public.pack_plaques TO service_role;
ALTER TABLE public.pack_plaques ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their pack plaques" ON public.pack_plaques
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.plaque_packs p
    JOIN public.business_members m ON m.business_id = p.business_id
    WHERE p.id = pack_plaques.pack_id AND m.user_id = auth.uid()
  ));

-- Activation attempt log for rate limiting (backend only)
CREATE TABLE IF NOT EXISTS public.activation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_key text NOT NULL,
  succeeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activation_attempts_key_time_idx
  ON public.activation_attempts (attempt_key, created_at DESC);

GRANT ALL ON public.activation_attempts TO service_role;
ALTER TABLE public.activation_attempts ENABLE ROW LEVEL SECURITY;