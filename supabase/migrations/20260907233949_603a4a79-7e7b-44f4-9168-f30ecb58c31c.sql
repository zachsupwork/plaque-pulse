CREATE TABLE public.business_social_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  platform text NOT NULL DEFAULT 'instagram',
  username text NOT NULL,
  profile_url text NOT NULL,
  scope text NOT NULL DEFAULT 'location',
  confidence integer NOT NULL DEFAULT 0,
  verification_status text NOT NULL DEFAULT 'candidate',
  source text NOT NULL DEFAULT 'discovery',
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  verified_by_user_id uuid,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_social_profiles_scope_check CHECK (scope IN ('location','brand')),
  CONSTRAINT business_social_profiles_status_check CHECK (verification_status IN ('verified','high_confidence','candidate','manual','rejected'))
);

CREATE UNIQUE INDEX business_social_profiles_unique
  ON public.business_social_profiles (business_id, platform, lower(username), coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX business_social_profiles_business_idx ON public.business_social_profiles (business_id, platform, verification_status);

GRANT SELECT ON public.business_social_profiles TO authenticated;
GRANT ALL ON public.business_social_profiles TO service_role;

ALTER TABLE public.business_social_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members and admins can view social profiles"
  ON public.business_social_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'::public.app_role
    )
    OR EXISTS (
      SELECT 1 FROM public.business_members m
      WHERE m.business_id = business_social_profiles.business_id
        AND m.user_id = auth.uid()
    )
  );