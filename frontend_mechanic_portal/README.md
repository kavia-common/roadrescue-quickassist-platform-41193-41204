# RoadRescue – QuickAssist (Mechanic Portal)

Mechanic dashboard for accepting unassigned requests and updating job status.

## Key flows

- Login (mechanic accounts)
- Dashboard (available/unassigned requests)
- My Assignments
- Request Detail (status updates + notes)
- Profile (name + service area)

## Auth & Data

This app supports two modes:

1. **Supabase mode**: if `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_KEY` are set, auth uses `supabase.auth` and requests/profiles are persisted in Supabase tables.
2. **Mock mode**: otherwise uses `localStorage` with seeded demo data.

Demo mechanic (mock mode): `mech@example.com` / `password123`

See `../assets/supabase.md` for suggested table schemas.
