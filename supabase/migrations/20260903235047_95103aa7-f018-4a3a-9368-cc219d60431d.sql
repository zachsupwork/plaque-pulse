ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'manufacturing_test';

ALTER TABLE public.plaques ADD COLUMN IF NOT EXISTS batch_id text;
CREATE INDEX IF NOT EXISTS plaques_batch_idx ON public.plaques (batch_id);

CREATE TABLE public.plaque_programming (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaque_id uuid NOT NULL UNIQUE REFERENCES public.plaques(id) ON DELETE CASCADE,
  batch_id text,
  expected_nfc_url text NOT NULL,
  write_status text NOT NULL DEFAULT 'not_programmed',
  verification_status text NOT NULL DEFAULT 'not_verified',
  programmed_at timestamptz,
  verified_at timestamptz,
  programmed_by_user_id uuid,
  verified_by_user_id uuid,
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plaque_programming TO authenticated;
GRANT ALL ON public.plaque_programming TO service_role;
ALTER TABLE public.plaque_programming ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage programming" ON public.plaque_programming
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners view their plaque programming" ON public.plaque_programming
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.plaques p
    WHERE p.id = plaque_programming.plaque_id
      AND p.business_id IS NOT NULL
      AND public.is_business_member(p.business_id)
  ));

CREATE TRIGGER plaque_programming_touch
  BEFORE UPDATE ON public.plaque_programming
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.programming_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaque_id uuid REFERENCES public.plaques(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  expected_value text,
  actual_value text,
  result text,
  user_id uuid,
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.programming_events TO authenticated;
GRANT ALL ON public.programming_events TO service_role;
ALTER TABLE public.programming_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read programming events" ON public.programming_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins write programming events" ON public.programming_events
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS programming_events_plaque_idx ON public.programming_events (plaque_id, created_at DESC);