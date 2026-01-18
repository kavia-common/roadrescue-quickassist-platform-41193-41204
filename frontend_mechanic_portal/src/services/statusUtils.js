/**
 * Shared request status utilities (Mechanic Portal).
 *
 * IMPORTANT:
 * The Supabase DB for `requests.status` is guarded by a CHECK constraint that expects
 * exact allowed string values. For "accepted" requests, the allowed value is:
 *   - "Assigned" (capital A, rest lowercase)
 *
 * Therefore, this portal:
 * - Writes "Assigned" when accepting a request
 * - Treats variants like "ASSIGNED" / "accepted" as equivalent when *reading*
 * - Uses friendly labels/badges derived from normalized values
 */

/**
 * PUBLIC_INTERFACE
 */
export function normalizeStatus(rawStatus) {
  /** Normalize any incoming status (db/UI/legacy) into a canonical token used by this app. */
  if (!rawStatus) return "Open";
  const s = String(rawStatus).trim();
  if (!s) return "Open";

  // Normalize common legacy/UI variants
  const upper = s.toUpperCase();

  // Handle spaced title-case values used in UI ("In Review", "En Route", etc.)
  const compact = upper.replace(/\s+/g, "_");

  const map = {
    // Open variants
    OPEN: "Open",
    SUBMITTED: "Open",
    IN_REVIEW: "Open",

    // Assigned/accepted variants (DB allowed value is Title Case "Assigned")
    ASSIGNED: "Assigned",
    ACCEPTED: "Assigned",

    // In-flight work
    EN_ROUTE: "EN_ROUTE",
    WORKING: "WORKING",
    IN_PROGRESS: "WORKING",

    // Completion
    COMPLETED: "COMPLETED",
    CLOSED: "COMPLETED",
  };

  return map[compact] || map[upper] || s;
}

/**
 * PUBLIC_INTERFACE
 */
export function statusLabel(rawStatus) {
  /** Convert raw/canonical status into a professional UI label. */
  const canonical = normalizeStatus(rawStatus);

  const labels = {
    Open: "Open",
    Assigned: "Assigned",
    EN_ROUTE: "En Route",
    WORKING: "Working",
    COMPLETED: "Completed",
  };

  return labels[canonical] || String(canonical).replace(/_/g, " ");
}

/**
 * PUBLIC_INTERFACE
 */
export function statusBadgeClass(rawStatus) {
  /** Return a badge CSS class for the given status (expects global badge styles). */
  const canonical = normalizeStatus(rawStatus);

  const map = {
    Open: "badge badge-blue",
    Assigned: "badge badge-blue",
    EN_ROUTE: "badge badge-amber",
    WORKING: "badge badge-amber",
    COMPLETED: "badge badge-green",
  };

  return map[canonical] || "badge";
}
