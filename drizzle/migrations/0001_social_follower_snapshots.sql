CREATE TABLE public.social_follower_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  social_profile_id uuid REFERENCES public.business_social_profiles(id) ON DELETE SET NULL,
  followers_count integer NOT NULL CHECK (followers_count >= 0),
  captured_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.social_follower_snapshots TO service_role;
ALTER TABLE public.social_follower_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no client access" ON public.social_follower_snapshots FOR SELECT TO authenticated USING (false);
CREATE INDEX social_follower_snapshots_biz_time ON public.social_follower_snapshots (business_id, captured_at);