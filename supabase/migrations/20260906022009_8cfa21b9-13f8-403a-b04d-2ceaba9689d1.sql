CREATE TABLE public.nfc_programming_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  plaque_id uuid NOT NULL REFERENCES public.plaques(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL,
  expected_url text NOT NULL,
  status text NOT NULL DEFAULT 'created',
  platform text,
  return_path text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  opened_at timestamptz,
  used_at timestamptz,
  verified_at timestamptz
);

GRANT ALL ON public.nfc_programming_sessions TO service_role;

ALTER TABLE public.nfc_programming_sessions ENABLE ROW LEVEL SECURITY;

-- Deny-all by design: these sessions are only ever read and written by TapLocal's
-- own server code using the service role. No client-side access path exists.
CREATE POLICY "No direct client access to programming sessions"
  ON public.nfc_programming_sessions
  FOR SELECT
  TO authenticated
  USING (false);

CREATE INDEX nfc_programming_sessions_plaque_idx ON public.nfc_programming_sessions (plaque_id, created_at DESC);

CREATE TRIGGER nfc_programming_sessions_touch
  BEFORE UPDATE ON public.nfc_programming_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();