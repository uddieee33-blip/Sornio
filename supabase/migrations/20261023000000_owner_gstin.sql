-- Allow GST-registered shops to save their supplier GSTIN independently of UPI setup.
-- Idempotent and additive: unregistered businesses keep the empty default.
-- Apply before deploying code that writes owner_profiles.gstin.
ALTER TABLE public.owner_profiles
  ADD COLUMN IF NOT EXISTS gstin TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.owner_profiles'::regclass
      AND conname = 'owner_profiles_gstin_format'
  ) THEN
    ALTER TABLE public.owner_profiles
      ADD CONSTRAINT owner_profiles_gstin_format
      CHECK (gstin = '' OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$');
  END IF;
END $$;
