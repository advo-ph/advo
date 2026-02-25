-- Add image_urls array column for multi-image portfolio support
ALTER TABLE public.portfolio_project
ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';

-- Backfill: copy existing image_url into image_urls array
UPDATE public.portfolio_project
SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL AND (image_urls IS NULL OR image_urls = '{}');