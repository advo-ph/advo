-- Set all team members with linked auth accounts to admin role
UPDATE public.team_member
SET
    permission_role = 'admin'
WHERE
    user_id IS NOT NULL
    AND (
        permission_role IS NULL
        OR permission_role != 'admin'
    );