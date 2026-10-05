ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'page_view';
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'link_click';
ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'referral_visit';

ALTER TABLE public.plaques ADD COLUMN IF NOT EXISTS destination_mode text NOT NULL DEFAULT 'direct';

CREATE TABLE public.business_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  title text,
  description text,
  logo_url text,
  accent text NOT NULL DEFAULT '#3b82f6',
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  share_code text NOT NULL UNIQUE DEFAULT substr(md5(gen_random_uuid()::text), 1, 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.business_pages TO service_role;
ALTER TABLE public.business_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access" ON public.business_pages FOR SELECT TO authenticated USING (false);
CREATE TRIGGER business_pages_touch BEFORE UPDATE ON public.business_pages FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();