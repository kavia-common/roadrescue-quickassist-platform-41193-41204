# Supabase integration (Mechanic Portal)

The mechanic portal can run in:

- **Supabase mode** when `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_KEY` are set
- **Mock mode** otherwise (localStorage)

See the user website `assets/supabase.md` for recommended `profiles`, `requests`, and `fees` tables.

Mechanic-specific usage:
- reads unassigned requests (`assigned_mechanic_id is null`)
- accepts a request (sets `assigned_mechanic_id`, `assigned_mechanic_email`, `status`)
- updates request status and appends to `notes`
- updates mechanic profile via flat columns on `profiles`:
  - `display_name` (text)
  - `service_area` (text)

## Schema check / migration note

If you previously followed an older schema where mechanic info lived in a JSON column like `profiles.profile`, you may see an error:

> Could not find the 'profile' column of 'profiles' in the schema cache.

**Fix:** Ensure your `profiles` table has these columns (TEXT):

- `display_name`
- `service_area`

Example SQL (run in Supabase SQL editor):

```sql
alter table public.profiles
  add column if not exists display_name text,
  add column if not exists service_area text;
```

Then reload the app (Supabase schema cache will refresh).
