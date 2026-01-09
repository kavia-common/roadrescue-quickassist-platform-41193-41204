# Supabase integration (Mechanic Portal)

The mechanic portal can run in:

- **Supabase mode** when `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_KEY` are set
- **Mock mode** otherwise (localStorage)

See the user website `assets/supabase.md` for the implemented schema, triggers, indexes, and RLS policies.

Note: a performance/index migration was applied on 2026-01-09 to add missing `requests` analytics/search columns and indexes used by dashboards/search.

Mechanic-specific usage (expected by RLS):

- Mechanics have `app_metadata.role = mechanic` (recommended but not strictly required if you rely on `profiles.role`)
- Mechanics must be approved in `public.profiles` using the **status-based flow**:
  - `role='mechanic'`
  - `status='approved'` (pending mechanics should be blocked)
  - `approved_at` is set when approved (nullable)
  - (Backward compat) Some environments may also have `approved` boolean; treat `approved=true` as approved.
- Approved mechanics can:
  - view all requests
  - accept an unassigned request by setting `assigned_mechanic_id` (or `mechanic_id`) to their own `auth.uid()`
  - update requests assigned to them
  - add notes on requests assigned to them (stored in `request_notes`)
  - manage their own profile fields (self-only)

RLS rule reminder (as per requirements):
Mechanics can access data ONLY if:
  auth.uid() = profile.id
  AND profile.role = 'mechanic'
  AND profile.status = 'approved'
