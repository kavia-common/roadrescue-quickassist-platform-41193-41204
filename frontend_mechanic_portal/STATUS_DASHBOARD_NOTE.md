# Dashboard request listing + status rendering note (Mechanic Portal)

## What this changes
The mechanic portal **Dashboard** now lists **all requests** and renders the status consistently as:

- `OPEN` → “Open”
- `ASSIGNED` / `EN_ROUTE` / `WORKING` → “Assigned / En Route / Working” (in-progress)
- `COMPLETED` → “Completed”

The “Accept” action is only available for requests that are:
- `status === 'OPEN'`
- AND `assigned_mechanic_id` is null
- AND the mechanic is approved.

## Realtime sync
The portal reads/writes requests primarily from the `public.requests` table.

Realtime subscriptions now listen to:
- `public.requests` (primary)
- `public.breakdown_requests` (fallback for older schemas)

This avoids the previous mismatch where reads/writes used `requests` but realtime listened only to `breakdown_requests`.

## Note about user_input_ref attachment
The referenced `user_input_ref` file path was not accessible during this run, so the implementation aligns with the repository’s existing data model and normalization strategy (`src/services/statusUtils.js` and `src/services/dataService.js`).
If the attachment becomes available later, re-check:
- exact table name (`requests` vs `breakdown_requests`)
- exact stored status values and any additional statuses
- whether “Dashboard” should filter (available-only) or show “all requests”
