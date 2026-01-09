# Supabase integration (Mechanic Portal)

The mechanic portal can run in:

- **Supabase mode** when `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_KEY` are set
- **Mock mode** otherwise (localStorage)

See the user website `assets/supabase.md` for the broader schema overview. This file documents the mechanic-portal-specific expectations and the RLS mechanics relevant to mechanic registration/approval.

## Key RLS fix (mechanic registration)

Problem: mechanic registration creates a Supabase Auth user then inserts into `public.profiles`. RLS was blocking this with:
> new row violates row-level security policy for table profiles

Fix: RLS now explicitly allows an authenticated user to insert **their own** profile row as long as:

- `auth.uid() = profiles.id`
- If inserting a mechanic profile, the row must start as **pending/unapproved**:
  - `role = 'mechanic'`
  - `status = 'pending'` (or null treated as pending)
  - `approved = false` (or null treated as false)
  - `approved_at is null`

This enables mechanic signup while keeping approval as an admin-only workflow.

## Roles & approval model (enforced)

Mechanic access is gated by **approval in `public.profiles`**:

- Mechanics must have:
  - `profiles.role = 'mechanic'`
  - and be approved via either:
    - `profiles.status = 'approved'` OR
    - legacy compatibility: `profiles.approved = true`
  - `approved_at` should be set by admin when approving (nullable)

Admins are detected via JWT `app_metadata.role = 'admin'` (set via Supabase Admin tooling / Admin API).

## RLS helper functions used

### `public.is_admin()`
Returns true if JWT `app_metadata.role` is `admin`.

### `public.is_approved_mechanic(uid uuid)`
Returns true if a profile exists for `uid` and it is a mechanic approved by `status='approved'` or legacy `approved=true`.

Notes:
- `is_approved_mechanic` is `SECURITY DEFINER` so it can safely read `public.profiles` during RLS evaluation.

## `public.profiles` RLS policies (effective behavior)

### SELECT
- authenticated user can select their own profile (`auth.uid() = id`)
- admin can select all (via `is_admin()`)

### INSERT
- authenticated user can insert their own profile row (`auth.uid() = id`)
- if inserting as `role='mechanic'`, must be pending/unapproved (see above)
- admin can insert any

### UPDATE
Because Postgres RLS policies cannot reliably reference `OLD.*` in a portable way, we enforce a simpler “no self-approval” constraint:

- authenticated user can update their own profile **only if the resulting row remains non-approved**:
  - `status` must not be `'approved'` (can remain null / pending)
  - `approved` must be false (or null treated as false)
  - `approved_at` must be null
- admin can update any field (including approving mechanics) via admin-only policy

## Mechanic access gating (approved-only)

Mechanics can access operational tables only when approved:

- `public.requests`: approved mechanics can read all requests (so they can pick work up)
- `public.request_notes`: approved mechanics can read/insert notes only for requests assigned to them
- admins always retain full access

## Supabase dashboard configuration reminder

In Supabase Dashboard:

1) Authentication → URL Configuration
- Add redirect URLs for each SPA environment (dev + prod), e.g.
  - `http://localhost:3001/**` (mechanic portal dev)
  - plus your production domain `https://.../**`

2) Ensure roles are assigned:
- `app_metadata.role` should be set for admins using Admin API / dashboard workflows.

Task completed: Updated Supabase RLS for `profiles` so authenticated users can insert/select their own row during signup while keeping approvals/admin access strictly gated.
