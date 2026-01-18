/**
 * Shared request status utilities (Mechanic Portal).
 *
 * IMPORTANT:
 * The `requests.status` column is guarded by a DB CHECK constraint that allows ONLY
 * these lowercase tokens:
 *   - "open"
 *   - "assigned"
 *   - "completed"
 *   - "canceled"
 *
 * This module enforces that:
 * - All writes use ONLY the above lowercase tokens.
 * - Any legacy/incorrect incoming values are normalized into one of these tokens.
 * - UI can display title-cased labels, but stored values remain lowercase tokens.
 */

/**
 * PUBLIC_INTERFACE
 */
export function normalizeStatus(rawStatus) {
  /** Normalize any incoming status (db/UI/legacy) into one of: open/assigned/completed/canceled. */
  if (rawStatus === null || rawStatus === undefined) return "open";

  const s = String(rawStatus).trim();
  if (!s) return "open";

  const lower = s.toLowerCase().trim();

  // Common legacy/UI variants -> canonical tokens
  // NOTE: We intentionally accept a broad set of historical values on READ to keep
  // older seeded/mock data and older DB rows from breaking the UI. On WRITE we
  // only output the four allowed tokens.
  const map = {
    // open
    open: "open",
    submitted: "open",
    "in review": "open",
    in_review: "open",
    pending: "open",

    // assigned
    assigned: "assigned",
    accepted: "assigned",
    "en route": "assigned",
    en_route: "assigned",
    working: "assigned",
    in_progress: "assigned",

    // completed
    completed: "completed",
    closed: "completed",
    done: "completed",

    // canceled
    canceled: "canceled",
    cancelled: "canceled",
    cancel: "canceled",
    canceled_by_user: "canceled",
    canceled_by_mechanic: "canceled",
  };

  if (map[lower]) return map[lower];

  // Also handle uppercase snake-cased legacy values like "EN_ROUTE"
  const compact = lower.replace(/\s+/g, "_");
  if (map[compact]) return map[compact];

  // Unknown status: default safely to open (keeps UI consistent and avoids bad writes).
  return "open";
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

  return labels[canonical] || "Open";
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

/**
 * PUBLIC_INTERFACE
 */
export function toDbStatus(value) {
  /** Convert any UI/legacy status input into a DB-safe lowercase token for writes. */
  return normalizeStatus(value);
}
