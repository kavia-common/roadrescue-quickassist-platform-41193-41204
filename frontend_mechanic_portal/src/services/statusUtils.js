/**
 * Shared request status utilities (Mechanic Portal).
 *
 * Canonical statuses across ALL portals:
 *   open, assigned, in_progress, completed, cancelled
 *
 * Note: Older versions of this repo used UPPERCASE tokens (OPEN/ASSIGNED/WORKING/etc).
 * This module is intentionally tolerant and normalizes legacy values into the canonical
 * lower-case tokens to keep the UI and storage consistent.
 */

/**
 * PUBLIC_INTERFACE
 */
export function normalizeStatus(rawStatus) {
  /** Normalize any incoming status (db/UI/legacy) into a canonical lower-case token. */
  if (!rawStatus) return "open";
  const s = String(rawStatus).trim();
  if (!s) return "open";

  const upper = s.toUpperCase();
  const compact = upper.replace(/\s+/g, "_");

  const map = {
    // Canonical / direct
    OPEN: "open",
    ASSIGNED: "assigned",
    IN_PROGRESS: "in_progress",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
    CANCELED: "cancelled",

    // Legacy variants (UI / old DB values)
    SUBMITTED: "open",
    IN_REVIEW: "open",
    "IN REVIEW": "open",

    ACCEPTED: "assigned",

    EN_ROUTE: "in_progress",
    "EN ROUTE": "in_progress",
    WORKING: "in_progress",
    "IN PROGRESS": "in_progress",

    CLOSED: "completed",
  };

  return map[compact] || map[upper] || "open";
}

/**
 * PUBLIC_INTERFACE
 */
export function isOpenRequestStatus(rawStatus) {
  /** Returns true when the request is considered "open/unassigned". */
  return normalizeStatus(rawStatus) === "open";
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
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
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
    open: "badge badge-blue",
    assigned: "badge badge-blue",
    in_progress: "badge badge-amber",
    completed: "badge badge-green",
    cancelled: "badge",
  };
  return map[canonical] || "badge";
}
