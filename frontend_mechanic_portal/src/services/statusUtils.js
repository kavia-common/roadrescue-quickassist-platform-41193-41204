/**
 * Shared request status utilities (Mechanic Portal).
 *
 * IMPORTANT:
 * The Postgres CHECK constraint `requests_status_check` in the user's DB allows ONLY:
 *   - open
 *   - assigned
 *   - completed
 *   - canceled
 *
 * Therefore, ALL write paths must use this exact lowercase set.
 */

/** Allowed statuses per DB CHECK constraint (authoritative). */
const ALLOWED = new Set(["open", "assigned", "completed", "canceled"]);

/**
 * PUBLIC_INTERFACE
 */
export function normalizeStatus(rawStatus) {
  /** Normalize any incoming status (db/UI/legacy) into a DB-permitted lowercase token. */
  if (!rawStatus) return "open";
  const s = String(rawStatus).trim();
  if (!s) return "open";

  const upper = s.toUpperCase();
  const compact = upper.replace(/\s+/g, "_");

  // Map legacy/cross-app tokens into the DB-permitted set.
  // NOTE: We intentionally collapse unsupported intermediate states.
  const map = {
    // Open-ish
    OPEN: "open",
    SUBMITTED: "open",
    IN_REVIEW: "open",
    "IN REVIEW": "open",

    // Assigned-ish
    ASSIGNED: "assigned",
    ACCEPTED: "assigned",

    // Unsupported intermediate states → assigned (closest permitted "in progress" signal)
    EN_ROUTE: "assigned",
    "EN ROUTE": "assigned",
    WORKING: "assigned",
    IN_PROGRESS: "assigned",
    "IN PROGRESS": "assigned",

    // Completion
    COMPLETED: "completed",
    CLOSED: "completed",

    // Cancellation (common variants)
    CANCELED: "canceled",
    CANCELLED: "canceled",
  };

  const candidate = map[compact] || map[upper] || s.toLowerCase();
  return ALLOWED.has(candidate) ? candidate : "open";
}

/**
 * PUBLIC_INTERFACE
 */
export function statusLabel(rawStatus) {
  /** Convert raw/canonical status into a professional UI label. */
  const canonical = normalizeStatus(rawStatus);
  const labels = {
    open: "Open",
    assigned: "Assigned",
    completed: "Completed",
    canceled: "Canceled",
  };
  return labels[canonical] || canonical;
}

/**
 * PUBLIC_INTERFACE
 */
export function statusBadgeClass(rawStatus) {
  /** Return a badge CSS class for the given status (expects global badge styles). */
  const canonical = normalizeStatus(rawStatus);
  const map = {
    open: "badge badge-blue",
    assigned: "badge badge-amber",
    completed: "badge badge-green",
    canceled: "badge",
  };
  return map[canonical] || "badge";
}
