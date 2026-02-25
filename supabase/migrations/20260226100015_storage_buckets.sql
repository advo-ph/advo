-- Create storage buckets for file uploads
INSERT INTO
    storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;

INSERT INTO
    storage.buckets (id, name, public)
VALUES (
        'portfolio',
        'portfolio',
        true
    ) ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to avatars bucket
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects FOR
INSERT
    TO authenticated
WITH
    CHECK (bucket_id = 'avatars');

CREATE POLICY "Anyone can view avatars" ON storage.objects FOR
SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can update avatars" ON storage.objects FOR
UPDATE TO authenticated USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can delete avatars" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars');

-- Allow authenticated users to upload to portfolio bucket
CREATE POLICY "Authenticated users can upload portfolio images" ON storage.objects FOR
INSERT
    TO authenticated
WITH
    CHECK (bucket_id = 'portfolio');

CREATE POLICY "Anyone can view portfolio images" ON storage.objects FOR
SELECT USING (bucket_id = 'portfolio');

CREATE POLICY "Authenticated users can update portfolio images" ON storage.objects FOR
UPDATE TO authenticated USING (bucket_id = 'portfolio');

CREATE POLICY "Authenticated users can delete portfolio images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'portfolio');