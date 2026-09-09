CREATE TABLE public.contributor_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  contributor_id text,
  profile_url text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.contributor_watchlist TO service_role;
ALTER TABLE public.contributor_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contributor_watchlist no client access" ON public.contributor_watchlist FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE INDEX contributor_watchlist_business_idx ON public.contributor_watchlist (business_id);
CREATE TRIGGER contributor_watchlist_touch BEFORE UPDATE ON public.contributor_watchlist FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.google_review_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  google_place_id text,
  external_key text NOT NULL,
  author_name text,
  author_profile_url text,
  author_photo_url text,
  rating numeric,
  review_text text,
  published_at timestamptz,
  relative_time text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, external_key)
);
GRANT ALL ON public.google_review_observations TO service_role;
ALTER TABLE public.google_review_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "google_review_observations no client access" ON public.google_review_observations FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE INDEX google_review_observations_business_idx ON public.google_review_observations (business_id, published_at DESC);
CREATE TRIGGER google_review_observations_touch BEFORE UPDATE ON public.google_review_observations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.maps_photo_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  watchlist_id uuid REFERENCES public.contributor_watchlist(id) ON DELETE SET NULL,
  contributor_name text,
  contributor_id text,
  photo_ref text NOT NULL,
  photo_url text,
  status text NOT NULL DEFAULT 'needs_verification',
  previous_status text,
  status_changed_at timestamptz,
  gallery_rank integer,
  gallery_size integer,
  confidence integer NOT NULL DEFAULT 0,
  verification_type text NOT NULL DEFAULT 'places_api',
  perceptual_hash text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, photo_ref)
);
GRANT ALL ON public.maps_photo_observations TO service_role;
ALTER TABLE public.maps_photo_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "maps_photo_observations no client access" ON public.maps_photo_observations FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE INDEX maps_photo_observations_business_idx ON public.maps_photo_observations (business_id, gallery_rank);
CREATE INDEX maps_photo_observations_changed_idx ON public.maps_photo_observations (status_changed_at DESC);
CREATE TRIGGER maps_photo_observations_touch BEFORE UPDATE ON public.maps_photo_observations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.evidence_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  observation_id uuid REFERENCES public.maps_photo_observations(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'screenshot',
  perceptual_hash text,
  thumbnail text,
  match_distance integer,
  note text,
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.evidence_uploads TO service_role;
ALTER TABLE public.evidence_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evidence_uploads no client access" ON public.evidence_uploads FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE INDEX evidence_uploads_business_idx ON public.evidence_uploads (business_id, created_at DESC);

CREATE TABLE public.attribution_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  plaque_id uuid REFERENCES public.plaques(id) ON DELETE SET NULL,
  kind text NOT NULL,
  badge text NOT NULL DEFAULT 'INFERRED',
  confidence integer NOT NULL DEFAULT 0,
  headline text NOT NULL,
  detail text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_ref text,
  occurred_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.attribution_candidates TO service_role;
ALTER TABLE public.attribution_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attribution_candidates no client access" ON public.attribution_candidates FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE UNIQUE INDEX attribution_candidates_unique_idx ON public.attribution_candidates (event_id, kind, COALESCE(external_ref, ''));
CREATE INDEX attribution_candidates_business_idx ON public.attribution_candidates (business_id, occurred_at DESC);
CREATE TRIGGER attribution_candidates_touch BEFORE UPDATE ON public.attribution_candidates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();