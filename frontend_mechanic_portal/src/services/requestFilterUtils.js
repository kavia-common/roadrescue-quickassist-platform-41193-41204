/**
 * Request filtering utilities (Mechanic Portal).
 *
 * These are client-side helpers to filter request lists by:
 * - location (text contains, case-insensitive)
 * - issue description (text contains, case-insensitive)
 * - status (exact match from: open, assigned, completed, canceled)
 */

import { normalizeStatus } from "./statusUtils";

function toLowerSafe(v) {
  if (v === null || v === undefined) return "";
  return String(v).toLowerCase();
}

function containsCI(haystack, needle) {
  const n = toLowerSafe(needle).trim();
  if (!n) return true;
  return toLowerSafe(haystack).includes(n);
}

function extractLocationText(request) {
  // Future-proof: support different schema shapes without breaking.
  // We try several common fields; if none exist, return empty string.
  return (
    request?.location?.address ||
    request?.location?.name ||
    request?.locationText ||
    request?.location_address ||
    request?.address ||
    request?.serviceArea ||
    ""
  );
}

// PUBLIC_INTERFACE
export function filterRequests(rows, filters) {
  /** Filter a list of normalized request rows with combinable filters. */
  const locationNeedle = filters?.location || "";
  const issueNeedle = filters?.issue || "";
  const statusNeedle = normalizeStatus(filters?.status || ""); // "" becomes "open" in normalizeStatus, so handle separately
  const hasStatus = Boolean((filters?.status || "").trim());

  return (rows || []).filter((r) => {
    const okLocation = containsCI(extractLocationText(r), locationNeedle);
    const okIssue = containsCI(r?.issueDescription || "", issueNeedle);
    const okStatus = hasStatus ? normalizeStatus(r?.status) === statusNeedle : true;
    return okLocation && okIssue && okStatus;
  });
}

// PUBLIC_INTERFACE
export function countActiveFilters(filters) {
  /** Returns number of active filters (non-empty). */
  let n = 0;
  if ((filters?.location || "").trim()) n += 1;
  if ((filters?.issue || "").trim()) n += 1;
  if ((filters?.status || "").trim()) n += 1;
  return n;
}
