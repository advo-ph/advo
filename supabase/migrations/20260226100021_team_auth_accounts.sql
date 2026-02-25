-- Create auth accounts for all team members with shared password
-- and link them to their team_member records + admin_user table

DO $$
DECLARE
  _pw TEXT := crypt('Advo2026!admin', gen_salt('bf'));
  _emails TEXT[] := ARRAY[
    'prince.wagan@advo.ph',
    'angelo.revelo@advo.ph',
    'schiffier.silang@advo.ph',
    'au.cargason@advo.ph',
    'anthony.ramos@advo.ph',
    'david.remo@advo.ph'
  ];
  _email TEXT;
  _uid UUID;
BEGIN
  FOREACH _email IN ARRAY _emails LOOP
    -- Check if auth user already exists
    SELECT id INTO _uid FROM auth.users WHERE email = _email;

    IF _uid IS NULL THEN
      -- Create new auth user
      _uid := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role,
        email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        _uid, 'authenticated', 'authenticated',
        _email, _pw,
        NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        NOW(), NOW(), '', ''
      );

      -- Also insert identity row so password login works
      INSERT INTO auth.identities (
        id, user_id, provider_id, provider,
        identity_data, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), _uid, _email, 'email',
        jsonb_build_object('sub', _uid::text, 'email', _email), NOW(), NOW(), NOW()
      );
    ELSE
      -- Update existing user's password
      UPDATE auth.users SET encrypted_password = _pw, updated_at = NOW()
      WHERE id = _uid;
    END IF;

    -- Link auth user to team_member
    UPDATE public.team_member SET user_id = _uid WHERE email = _email AND user_id IS NULL;

    -- Grant admin access
    INSERT INTO public.admin_user (user_id)
    VALUES (_uid)
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END $$;