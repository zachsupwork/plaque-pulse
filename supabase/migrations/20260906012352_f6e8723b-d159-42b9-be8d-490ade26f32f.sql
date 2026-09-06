ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS google_review_url text,
  ADD COLUMN IF NOT EXISTS google_review_url_source text,
  ADD COLUMN IF NOT EXISTS google_review_url_checked_at timestamp with time zone;