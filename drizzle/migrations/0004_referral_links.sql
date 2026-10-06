ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'share_created';
CREATE TABLE public.referral_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  plaque_id uuid REFERENCES public.plaques(id) ON DELETE SET NULL,
  tap_event_id uuid,
  page_view_id uuid,
  share_event_id uuid,
  source_type text,
  visit_count integer NOT NULL DEFAULT 0,
  first_visit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.referral_links TO service_role;
ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access" ON public.referral_links FOR SELECT TO authenticated USING (false);
CREATE INDEX referral_links_business_idx ON public.referral_links(business_id, created_at);