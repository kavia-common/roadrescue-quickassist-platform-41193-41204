# Status propagation (Dashboard ↔ My Assignments)

This change ensures that request status transitions (OPEN → ASSIGNED → COMPLETED) propagate consistently across:

- **Dashboard** (available/unassigned requests)
- **My Assignments** (requests assigned to the current mechanic)

## What was implemented

1. **Local event propagation**
   - A tiny in-app event bus (`src/services/requestEvents.js`)
   - `dataService.acceptRequest()` and `dataService.updateRequestStatus()` emit `rrqa:requests_changed`
   - Both **DashboardPage** and **MyAssignmentsPage** subscribe and auto-refresh

2. **Supabase realtime propagation (best-effort)**
   - `dataService.subscribeToRequestsChanges()` subscribes to `public.requests` via `supabase.channel(...).on('postgres_changes', ...)`
   - Pages also subscribe to this (no-op in mock mode)

This combination covers:
- Changes made on another page in the same SPA session
- Changes made by another client (another mechanic/admin) if Supabase realtime is enabled

## Note about user_input_ref attachment
The task referenced an attachment path that was not accessible in this session runtime, so this implementation follows the repository's current canonical status model:
- Stored status tokens are normalized to UPPERCASE: `OPEN`, `ASSIGNED`, `EN_ROUTE`, `WORKING`, `COMPLETED`
- Dashboard lists unassigned `OPEN` requests
- My Assignments lists all requests with `assigned_mechanic_id = current mechanic`
"""
