CREATE TABLE public.activation_drafts (
  plaque_id uuid PRIMARY KEY REFERENCES public.plaques(id) ON DELETE CASCADE,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.activation_drafts TO service_role;
ALTER TABLE public.activation_drafts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER activation_drafts_touch BEFORE UPDATE ON public.activation_drafts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();