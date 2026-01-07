/**
 * Shared request status utilities (Mechanic Portal).
 *
 * We store canonical statuses in Supabase (source of truth) as UPPERCASE tokens
 * to be schema-agnostic and consistent across apps.
 *
 * UI can display friendly labels derived from these canonical values.
 */

/**
 * PUBLIC_INTERFACE
 */
export function normalizeStatus(rawStatus) {
  /** Normalize any incoming status (db/UI/legacy) into a canonical uppercase token. */
  if (!rawStatus) return "OPEN";
  const s = String(rawStatus).trim();
  if (!s) return "OPEN";

  // Normalize common legacy/UI variants
  const upper = s.toUpperCase();

  // Handle spaced title-case values used in UI ("In Review", "En Route", etc.)
  const compact = upper.replace(/\s+/g, "_");

  const map = {
    // Legacy "open" variants
    OPEN: "OPEN",
    SUBMITTED: "OPEN",
    IN_REVIEW: "OPEN",
    "IN REVIEW": "OPEN",

    // Accepted/assigned variants
    ASSIGNED: "ASSIGNED",
    ACCEPTED: "ASSIGNED",

    // In-flight work
    EN_ROUTE: "EN_ROUTE",
    "EN ROUTE": "EN_ROUTE",
    WORKING: "WORKING",
    IN_PROGRESS: "WORKING",
    "IN PROGRESS": "WORKING",

    // Completion
    COMPLETED: "COMPLETED",
    CLOSED: "COMPLETED",
  };

  return map[compact] || map[upper] || compact;
}

/**
 * PUBLIC_INTERFACE
 */
export function statusLabel(rawStatus) {
  /** Convert raw/canonical status into a professional UI label. */
  const canonical = normalizeStatus(rawStatus);
  const labels = {
    OPEN: "Open",
    ASSIGNED: "Assigned",
    EN_ROUTE: "En Route",
    WORKING: "Working",
    COMPLETED: "Completed",
  };
  return labels[canonical] || canonical.replace(/_/g, " ");
}

/**
 * PUBLIC_INTERFACE
 */
export function statusBadgeClass(rawStatus) {
  /** Return a badge CSS class for the given status (expects global badge styles). */
  const canonical = normalizeStatus(rawStatus);
  const map = {
    OPEN: "badge badge-blue",
    ASSIGNED: "badge badge-blue",
    EN_ROUTE: "badge badge-amber",
    WORKING: "badge badge-amber",
    COMPLETED: "badge badge-green",
  };
  return map[canonical] || "badge";
}
