# Supabase integration (Mechanic Portal)

The mechanic portal can run in:

- **Supabase mode** when `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_KEY` are set
- **Mock mode** otherwise (localStorage)

See the user website `assets/supabase.md` for the implemented schema, triggers, indexes, and RLS policies.

Note: a performance/index migration was applied on 2026-01-09 to add missing `requests` analytics/search columns and indexes used by dashboards/search.

Mechanic-specific usage (expected by RLS):

- Mechanics have `app_metadata.role = mechanic`
- Mechanics must also be approved in `public.profiles` (`role='mechanic'` and `approved=true`)
- Approved mechanics can:
  - view all requests
  - accept an unassigned request by setting `assigned_mechanic_id` to their own `auth.uid()`
  - update requests assigned to them
  - add notes on requests assigned to them (stored in `request_notes`)
  - manage their `mechanic_profiles` row (self-only)
