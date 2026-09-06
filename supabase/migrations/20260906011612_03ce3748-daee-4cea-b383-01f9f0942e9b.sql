CREATE TABLE public.nfc_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  plaque_id uuid NOT NULL REFERENCES public.plaques(id) ON DELETE CASCADE,
  expected_url text NOT NULL,
  created_by_user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by_user_id uuid,
  result text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nfc_handoffs_plaque_idx ON public.nfc_handoffs (plaque_id);
GRANT ALL ON public.nfc_handoffs TO service_role;
ALTER TABLE public.nfc_handoffs ENABLE ROW LEVEL SECURITY;