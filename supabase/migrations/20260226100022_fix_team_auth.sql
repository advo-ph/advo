-- Fix auth accounts: clean up malformed records and recreate properly
-- The previous migration may have inserted incomplete identity rows

DO $$
DECLARE
  _pw TEXT := crypt('Advo2026!admin', gen_salt('bf'));
  _emails TEXT[] := ARRAY[
    'prince.wagan@advo.ph',
    'schiffier.silang@advo.ph',
    'au.cargason@advo.ph',
    'anthony.ramos@advo.ph',
    'david.remo@advo.ph'
  ];
  _email TEXT;
  _uid UUID;
BEGIN
  -- First: update Angelo's existing account password
  UPDATE auth.users SET encrypted_password = _pw, updated_at = NOW()
  WHERE email = 'angelo.revelo@advo.ph';

  -- For each other team member
  FOREACH _email IN ARRAY _emails LOOP
    SELECT id INTO _uid FROM auth.users WHERE email = _email;

    IF _uid IS NOT NULL THEN
      -- Delete broken records so we can recreate them cleanly
      DELETE FROM auth.identities WHERE user_id = _uid;
      DELETE FROM auth.users WHERE id = _uid;
    END IF;

    -- Create fresh auth user via Supabase-compatible insert
    _uid := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      invited_at,
      confirmation_token,
      confirmation_sent_at,
      recovery_token,
      recovery_sent_at,
      email_change_token_new,
      email_change,
      email_change_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      phone,
      phone_confirmed_at,
      phone_change,
      phone_change_token,
      phone_change_sent_at,
      email_change_token_current,
      email_change_confirm_status,
      banned_until,
      reauthentication_token,
      reauthentication_sent_at,
      is_sso_user,
      deleted_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      _uid,
      'authenticated',
      'authenticated',
      _email,
      _pw,
      NOW(),   -- email_confirmed_at
      NULL,    -- invited_at
      '',      -- confirmation_token
      NULL,    -- confirmation_sent_at
      '',      -- recovery_token
      NULL,    -- recovery_sent_at
      '',      -- email_change_token_new
      '',      -- email_change
      NULL,    -- email_change_sent_at
      NULL,    -- last_sign_in_at
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      jsonb_build_object('email', _email),
      FALSE,
      NOW(),
      NOW(),
      NULL,    -- phone
      NULL,    -- phone_confirmed_at
      '',      -- phone_change
      '',      -- phone_change_token
      NULL,    -- phone_change_sent_at
      '',      -- email_change_token_current
      0,       -- email_change_confirm_status
      NULL,    -- banned_until
      '',      -- reauthentication_token
      NULL,    -- reauthentication_sent_at
      FALSE,   -- is_sso_user
      NULL     -- deleted_at
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      provider,
      identity_data,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      _uid,      -- use same UUID as id
      _uid,
      _email,    -- provider_id = email
      'email',
      jsonb_build_object('sub', _uid::text, 'email', _email, 'email_verified', true, 'phone_verified', false),
      NULL,
      NOW(),
      NOW()
    );

    -- Link to team_member
    UPDATE public.team_member SET user_id = _uid WHERE email = _email AND user_id IS NULL;

    -- Grant admin
    INSERT INTO public.admin_user (user_id) VALUES (_uid) ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END $$;