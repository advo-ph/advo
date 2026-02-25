-- Add slug and case_study JSONB to portfolio_project
ALTER TABLE public.portfolio_project
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS case_study JSONB DEFAULT '{}';

-- Backfill slugs from existing titles (lowercase, hyphens for spaces, strip non-alphanumeric)
UPDATE public.portfolio_project
SET
    slug = LOWER(
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                TRIM(title),
                '[^a-zA-Z0-9\s-]',
                '',
                'g'
            ),
            '\s+',
            '-',
            'g'
        )
    )
WHERE
    slug IS NULL;