ALTER TABLE public.social_follower_snapshots
  ADD COLUMN IF NOT EXISTS follows_count integer,
  ADD COLUMN IF NOT EXISTS media_count integer,
  ADD COLUMN IF NOT EXISTS data_scope text NOT NULL DEFAULT 'public_profile';
ALTER TABLE public.business_social_profiles DROP CONSTRAINT IF EXISTS business_social_profiles_scope_check;
ALTER TABLE public.business_social_profiles ADD CONSTRAINT business_social_profiles_scope_check
  CHECK (scope = ANY (ARRAY['location'::text, 'brand'::text, 'contributor'::text]));
CREATE INDEX IF NOT EXISTS events_visitor_key_idx ON public.events (anonymous_visitor_key, occurred_at) WHERE anonymous_visitor_key IS NOT NULL;