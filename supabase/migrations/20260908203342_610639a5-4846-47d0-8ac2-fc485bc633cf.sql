CREATE TABLE public.area_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code text NOT NULL UNIQUE,
  name text NOT NULL,
  area_query text NOT NULL,
  category text NOT NULL DEFAULT 'food',
  design_type text NOT NULL DEFAULT 'generic',
  plaques_per_place integer NOT NULL DEFAULT 1,
  mode text NOT NULL DEFAULT 'prospects',
  notes text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.area_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.area_batches(id) ON DELETE CASCADE,
  position integer NOT NULL,
  google_place_id text NOT NULL,
  name text NOT NULL,
  address text,
  city text,
  latitude double precision,
  longitude double precision,
  category text,
  rating numeric,
  review_count integer,
  business_status text,
  maps_uri text,
  review_url text,
  website text,
  instagram text,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'not_visited',
  plaques_created integer NOT NULL DEFAULT 0,
  error text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, google_place_id)
);

CREATE INDEX area_prospects_batch_idx ON public.area_prospects (batch_id, position);
CREATE INDEX area_prospects_place_idx ON public.area_prospects (google_place_id);

CREATE TABLE public.area_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  area_query text NOT NULL,
  category text NOT NULL DEFAULT 'food',
  last_run_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.area_batches TO service_role;
GRANT ALL ON public.area_prospects TO service_role;
GRANT ALL ON public.area_searches TO service_role;

ALTER TABLE public.area_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_searches ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER area_batches_touch BEFORE UPDATE ON public.area_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER area_prospects_touch BEFORE UPDATE ON public.area_prospects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();