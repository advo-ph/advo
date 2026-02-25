-- Link Angelo Revelo auth user to team_member and set admin role
UPDATE public.team_member
SET
    user_id = 'e300fa30-4e3b-4b3b-992a-f7bb62daf154',
    permission_role = 'admin'
WHERE
    name = 'Angelo Revelo';