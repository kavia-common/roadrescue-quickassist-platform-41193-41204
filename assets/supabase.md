# Supabase integration (Mechanic Portal)

The mechanic portal can run in:

- **Supabase mode** when `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_KEY` are set
- **Mock mode** otherwise (localStorage)

See the user website `assets/supabase.md` for recommended `profiles`, `requests`, and `fees` tables.

Mechanic-specific usage:
- reads unassigned requests (`assigned_mechanic_id is null`)
- accepts a request (sets `assigned_mechanic_id`, `assigned_mechanic_email`, `status`)
- updates request status and appends to `notes`
- updates mechanic profile via `profiles.profile` json
