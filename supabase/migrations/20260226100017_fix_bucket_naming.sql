-- Rename 'avatars' bucket to 'avatar' to follow singular naming convention
-- Create the correctly-named bucket
INSERT INTO
    storage.buckets (id, name, public)
VALUES ('avatar', 'avatar', true) ON CONFLICT (id) DO NOTHING;

-- RLS policies for 'avatar' bucket
CREATE POLICY "Authenticated users can upload avatar" ON storage.objects FOR
INSERT
    TO authenticated
WITH
    CHECK (bucket_id = 'avatar');

CREATE POLICY "Anyone can view avatar" ON storage.objects FOR
SELECT USING (bucket_id = 'avatar');

CREATE POLICY "Authenticated users can update avatar" ON storage.objects FOR
UPDATE TO authenticated USING (bucket_id = 'avatar');

CREATE POLICY "Authenticated users can delete avatar" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatar');

-- Drop old 'avatars' policies (bucket left orphaned but unused)
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;