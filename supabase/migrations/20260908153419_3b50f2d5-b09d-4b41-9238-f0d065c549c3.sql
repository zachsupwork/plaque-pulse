CREATE TABLE public.qr_print_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaque_id uuid NOT NULL REFERENCES public.plaques(id) ON DELETE CASCADE,
  encoded_url text NOT NULL,
  slug text NOT NULL,
  batch_id text,
  print_position integer,
  design_name text,
  design_version text,
  printed_by_user_id uuid,
  printed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.qr_print_records TO service_role;

ALTER TABLE public.qr_print_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No client access to qr print records"
ON public.qr_print_records FOR SELECT TO authenticated USING (false);

CREATE INDEX qr_print_records_plaque_idx ON public.qr_print_records(plaque_id);
CREATE INDEX qr_print_records_slug_idx ON public.qr_print_records(slug);
CREATE INDEX qr_print_records_batch_idx ON public.qr_print_records(batch_id);

CREATE TRIGGER qr_print_records_touch
BEFORE UPDATE ON public.qr_print_records
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();