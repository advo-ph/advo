-- Fix: insert Angelo's auth user_id into admin_user table
-- is_admin() checks admin_user, not team_member.permission_role
INSERT INTO
    public.admin_user (user_id)
VALUES (
        'e300fa30-4e3b-4b3b-992a-f7bb62daf154'
    ) ON CONFLICT (user_id) DO NOTHING;