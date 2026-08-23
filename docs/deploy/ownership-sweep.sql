-- Generic ownership sweep: everything in public belongs to advo.
-- Tables first; sequences OWNED BY a table column follow their table automatically,
-- so only standalone sequences are altered directly.
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT c.relkind AS k, c.relname AS nm
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind IN ('r','p')
      AND pg_get_userbyid(c.relowner) <> 'advo'
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO advo', r.nm); n := n + 1;
  END LOOP;

  FOR r IN
    SELECT c.relkind AS k, c.relname AS nm
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind IN ('v','m')
      AND pg_get_userbyid(c.relowner) <> 'advo'
  LOOP
    EXECUTE format('ALTER VIEW public.%I OWNER TO advo', r.nm); n := n + 1;
  END LOOP;

  FOR r IN
    SELECT c.relname AS nm
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'S'
      AND pg_get_userbyid(c.relowner) <> 'advo'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'a'
      )
  LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO advo', r.nm); n := n + 1;
  END LOOP;

  FOR r IN
    SELECT t.typname AS nm FROM pg_type t JOIN pg_namespace ns ON ns.oid = t.typnamespace
    WHERE ns.nspname = 'public' AND t.typtype = 'e'
      AND pg_get_userbyid(t.typowner) <> 'advo'
  LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO advo', r.nm); n := n + 1;
  END LOOP;

  RAISE NOTICE 'reassigned % object(s) to advo', n;
END $$;
