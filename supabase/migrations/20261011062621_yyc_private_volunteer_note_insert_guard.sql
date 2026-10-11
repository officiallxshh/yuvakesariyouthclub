-- Keep private administrator review notes out of public volunteer inserts.
-- Normal website submissions omit both columns, so existing submission flows remain compatible.
ALTER POLICY "public submit volunteer"
ON public.volunteers
WITH CHECK (
  review_notes IS NULL
  AND review_notes_updated_at IS NULL
);
