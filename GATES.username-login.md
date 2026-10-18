# Gates: username login and existing-account password reset

OWNS: apps/api/src/db/schema.ts, apps/api/src/utils/username.ts, apps/api/src/services/auth.service.ts, apps/api/src/routes/auth.routes.ts, apps/api/src/routes/team.routes.ts, apps/api/src/routes/clients.routes.ts, apps/api/src/routes/leads.routes.ts, apps/api/src/db/seed.ts, apps/api/migrations/049_username_login.sql, apps/web/src/hooks/useAuth.tsx, apps/web/src/pages/Login.tsx, scripts/reset-existing-user-passwords.mjs, README.md, docs/SETUP.md

Scope: let existing client and member accounts sign in with a canonical username derived from the email local part, reset existing account credentials, and keep both login variants ready for production use.

- [x] G1: existing account usernames are normalized from email local parts and checked for collisions before password data changes
  EVIDENCE: `usernameFromEmail` and `normalizeUsername` share lowercase ASCII alphanumeric normalization; migration 049 backfills with the same rule and aborts on empty or duplicate usernames before any reset operation.

- [x] G2: password and magic-link forms accept usernames for both Clients and Members, and the API resolves the same username namespace
  EVIDENCE: `/members` and `/clients` render the same `Login` component; both password and magic-link handlers send `username`, and both API paths resolve it through `user.username`.

- [x] G3: the one-time password-reset operation salts the chosen password per account, revokes stored sessions, and requires an explicit confirmation flag
  EVIDENCE: the maintenance script hashes each account independently with bcrypt, clears magic links, deletes all session/device keys in one transaction, and refuses to run without both `RESET_PASSWORD` and its confirmation flag; `node --check scripts/reset-existing-user-passwords.mjs` exited 0.

- [x] G4: the web application typechecks and builds
  CHECK: npm --workspace apps/web run build && printf 'username login web build passed\n'
  EXPECT: username login web build passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/princewagan/advo-1; output=tsc and Vite production build completed; username login web build passed

- [x] G5: the API application typechecks
  CHECK: npm --workspace apps/api run build && printf 'username login API build passed\n'
  EXPECT: username login API build passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/princewagan/advo-1; output=tsc; username login API build passed

- [x] G6: the members login and admin area are not blocked by a demo-only route or environment gate
  EVIDENCE: `App.tsx` registers `/members` and protects `/admin` by role via `ProtectedRoute`; no demo-only flag was found in the route or environment-gate code. Production preflight: 17 accounts, 0 empty usernames, 0 normalized username collisions.
