# Supabase integration (Mechanic Portal)

The mechanic portal can run in:

- **Supabase mode** when `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_KEY` are set
- **Mock mode** otherwise (localStorage)

See the user website `assets/supabase.md` for the implemented schema and RLS policies.

Mechanic-specific usage:
- reads requests (RLS allows mechanics to select requests)
- accepts a request (updates `assigned_mechanic_id`, `assigned_mechanic_email`, `status`)
- updates request status and notes
- updates mechanic profile via flat columns on `profiles`:
  - `display_name` (text)
  - `service_area` (text)
