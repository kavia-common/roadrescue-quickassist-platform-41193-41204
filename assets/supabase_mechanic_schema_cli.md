# Supabase DB schema (Mechanic Portal) — CLI / one-statement commands

This project’s mechanic portal queries two tables that must exist in Supabase:

- `public.mechanics`
- `public.user_roles`

If you see an error like **`public.mechanics table not found in schema cache`**, create the tables and RLS policies below.

> Important:
> - Run **each statement one-at-a-time** (each bullet is a single `psql -c "..."` statement).
> - These commands assume you are connected to the **same Postgres DB used by Supabase**.
> - If you are using Supabase hosted, you can run these in the SQL editor too (one statement at a time).
>
> This repo environment did not include a `db_connection.txt`, so you must supply your own connection string.

## 0) Connect (example)

Use your Supabase connection string (Settings → Database → Connection string):

```bash
psql "postgresql://USER:PASSWORD@HOST:5432/postgres"
```

Or run one-liners:

```bash
psql "postgresql://..." -c "SELECT now();"
```

---

## 1) Create `mechanics` table (minimal columns used by the app)

The mechanic portal writes/reads:
- `user_id` (Supabase auth user id)
- `full_name`, `email`, `phone`
- `service_area`, `specialization`
- `status` ∈ `pending|approved|rejected|suspended`
- timestamps

Run:

```bash
psql "postgresql://..." -c "CREATE TABLE IF NOT EXISTS public.mechanics ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE, full_name text NOT NULL, email text NOT NULL, phone text NULL, service_area text NULL, specialization text[] NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT mechanics_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE );"
```

Index to speed up `.eq('user_id', ...)`:

```bash
psql "postgresql://..." -c "CREATE INDEX IF NOT EXISTS mechanics_user_id_idx ON public.mechanics(user_id);"
```

(Optional) Updated timestamp helper (kept as one statement):

```bash
psql "postgresql://..." -c "CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;"
```

(Optional) Trigger (one statement):

```bash
psql "postgresql://..." -c "DROP TRIGGER IF EXISTS set_mechanics_updated_at ON public.mechanics; CREATE TRIGGER set_mechanics_updated_at BEFORE UPDATE ON public.mechanics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();"
```

---

## 2) Create `user_roles` table (minimal)

The mechanic portal attempts to insert:
- `user_id`
- `role` (e.g. `mechanic`)

Run:

```bash
psql "postgresql://..." -c "CREATE TABLE IF NOT EXISTS public.user_roles ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT user_roles_user_role_unique UNIQUE (user_id, role), CONSTRAINT user_roles_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE );"
```

Index:

```bash
psql "postgresql://..." -c "CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON public.user_roles(user_id);"
```

---

## 3) Enable RLS

Enable Row Level Security:

```bash
psql "postgresql://..." -c "ALTER TABLE public.mechanics ENABLE ROW LEVEL SECURITY;"
```

```bash
psql "postgresql://..." -c "ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;"
```

---

## 4) RLS policies: “Authenticated users can read their own mechanic record”

### Allow SELECT on own record

```bash
psql "postgresql://..." -c "DROP POLICY IF EXISTS mechanics_select_own ON public.mechanics; CREATE POLICY mechanics_select_own ON public.mechanics FOR SELECT TO authenticated USING (user_id = auth.uid());"
```

### Allow INSERT only for self (supports registration flow)

```bash
psql "postgresql://..." -c "DROP POLICY IF EXISTS mechanics_insert_self ON public.mechanics; CREATE POLICY mechanics_insert_self ON public.mechanics FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());"
```

> Note: Updates (e.g. approving) should typically be done by admins/service-role only.
> This doc intentionally does NOT grant UPDATE/DELETE to normal authenticated users.

---

## 5) (Optional but recommended) RLS policies for `user_roles`

The frontend tries to insert `{ user_id: currentUser.id, role: 'mechanic' }`.
If you want to allow that insert for authenticated users (self only), run:

```bash
psql "postgresql://..." -c "DROP POLICY IF EXISTS user_roles_insert_self ON public.user_roles; CREATE POLICY user_roles_insert_self ON public.user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());"
```

If you want users to be able to read their own roles:

```bash
psql "postgresql://..." -c "DROP POLICY IF EXISTS user_roles_select_self ON public.user_roles; CREATE POLICY user_roles_select_self ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());"
```

---

## 6) Quick sanity checks

Verify table presence:

```bash
psql "postgresql://..." -c "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('mechanics','user_roles');"
```

Verify RLS:

```bash
psql "postgresql://..." -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('mechanics','user_roles');"
```

List policies:

```bash
psql "postgresql://..." -c "SELECT schemaname, tablename, policyname, roles, cmd FROM pg_policies WHERE tablename IN ('mechanics','user_roles');"
```

---

## Notes / alignment with the mechanic portal code

The mechanic portal (React) expects:
- `mechanics.status` to be one of: `pending`, `approved`, `rejected`, `suspended`
- mechanic lookup by `user_id` equals `auth.uid()` (current signed-in user)
- user_roles insert is best-effort; failures won't block mechanics table use, but allowing it improves UX.
