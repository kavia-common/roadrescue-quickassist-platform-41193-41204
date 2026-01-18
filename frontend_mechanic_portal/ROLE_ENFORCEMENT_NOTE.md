# Mechanic portal role/status enforcement note

This change enforces the mechanic approval-gated rule in the mechanic portal:

- All mechanic signups set:
  - `profiles.role = 'mechanic'`
  - `profiles.mechanic_status = 'pending'`

- All mechanic profile updates from the mechanic portal also force:
  - `profiles.role = 'mechanic'`
  - `profiles.mechanic_status = 'pending'`

Rationale: prevents role/status drift via client-side profile update flows and keeps approval admin-only.

## Note about `user_input_ref`
The task referenced an attachment at:

`/home/kavia/workspace/code-generation/temp-attachments/orchestrator_user_input_20260117_095947_182622.txt`

That file was not present/accessible in this session runtime (`temp-attachments/` directory was empty), so the implementation follows the mechanic portal rules already present in the repository (`assets/supabase.md` and `assets/supabase_mechanic_schema_cli.md`) and extends enforcement to the update path as requested.
