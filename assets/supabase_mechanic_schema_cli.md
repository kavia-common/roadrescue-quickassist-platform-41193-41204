# Supabase DB schema (Mechanic Portal) — CLI / one-statement commands

This mechanic portal must **NOT** use a `public.mechanics` table.

Instead, mechanic approval state and profile fields are stored on the existing:

- `public.profiles` (authoritative for mechanic auth + status)
- `public.user_roles` (optional / best-effort; used as an additional role signal)

The portal expects these `profiles` columns to exist:

- `role` TEXT — `'user' | 'mechanic' | 'admin'`
- `mechanic_status` TEXT — `'pending' | 'approved' | 'rejected' | 'suspended'`
- `service_area` TEXT
- `specialization` TEXT[]
- `phone` TEXT

If you previously followed older docs that referenced `public.mechanics`, remove/ignore that table and migrate to `profiles.mechanic_status`.

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

## 1) Add mechanic fields to `profiles`

### Add columns (safe if they already exist)

```bash
psql "postgresql://..." -c "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text;"
```

```bash
psql "postgresql://..." -c "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mechanic_status text;"
```

```bash
psql "postgresql://..." -c "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS service_area text;"
```

```bash
psql "postgresql://..." -c "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS specialization text[];"
```

```bash
psql "postgresql://..." -c "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;"
```

### Add basic CHECK constraint for mechanic_status (optional)

> If you already have a constraint name collision, rename it.

```bash
psql "postgresql://..." -c "DO $$ BEGIN ALTER TABLE public.profiles ADD CONSTRAINT profiles_mechanic_status_check CHECK (mechanic_status IS NULL OR mechanic_status IN ('pending','approved','rejected','suspended')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
```

---

## 2) Create `user_roles` table (optional)

The frontend tries to insert:
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

## 3) RLS notes

This portal updates `profiles` during mechanic registration:

- sets `role='mechanic'`
- sets `mechanic_status='pending'`
- sets `phone/service_area/specialization`

If your `profiles` table has RLS enabled, you must allow authenticated users to update their own row for these columns.

Example policy patterns (adjust to your security model):

- Allow SELECT on own profile: `id = auth.uid()`
- Allow UPDATE on own profile: `id = auth.uid()`

> Admin approval (changing mechanic_status to 'approved') should typically be done via an admin UI using a service role key or an Edge Function, not from a normal authenticated client.

---

## 4) Quick sanity checks

Verify `profiles` has needed columns:

```bash
psql "postgresql://..." -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name IN ('role','mechanic_status','service_area','specialization','phone');"
```

Verify `user_roles` presence (if used):

```bash
psql "postgresql://..." -c "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('user_roles');"
```

---

## Notes / alignment with the mechanic portal code

- Mechanic application status is read from `profiles.mechanic_status`.
- Mechanic lookup is by `profiles.id = auth.uid()`.
- The portal treats `user_roles` as best-effort; approval gating is always based on `profiles.mechanic_status`.
