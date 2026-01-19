/**
 * Request filtering utilities (Mechanic Portal).
 *
 * These are client-side helpers to filter request lists by:
 * - location (text contains, case-insensitive)
 * - issue description (text contains, case-insensitive)
 * - status (exact match from: open, assigned, completed, canceled)
 */

import { normalizeStatus } from "./statusUtils";

/**
 * Normalize free-text for resilient "contains" matching:
 * - trim
 * - collapse whitespace
 * - lowercase
 * - remove diacritics (e.g., "São" -> "sao")
 * - remove punctuation to reduce false negatives (e.g., "Downtown," -> "downtown")
 */
function normalizeText(v) {
  if (v === null || v === undefined) return "";
  let s = String(v);

  // Normalize unicode + strip diacritics
  try {
    s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  } catch {
    // If normalize isn't supported, fall back gracefully.
  }

  // Collapse whitespace + lowercase
  s = s.replace(/\s+/g, " ").trim().toLowerCase();

  // Replace punctuation with spaces, then collapse again
  s = s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  return s;
}

function containsNormalized(haystack, needle) {
  const n = normalizeText(needle);
  if (!n) return true;
  return normalizeText(haystack).includes(n);
}

function extractLocationText(request) {
  /**
   * IMPORTANT:
   * Requests returned by dataService.normalizeRequestRow() currently do NOT
   * include a canonical "locationText" field, so filtering must check multiple
   * possible schema shapes directly.
   *
   * We support:
   * - nested JSON: request.location.{name,address,formatted_address}
   * - common flat columns: location, location_text, location_name, pickup_location, address, address_line, city, area
   */
  const loc = request?.location;

  const nested =
    (loc && typeof loc === "object" && (loc.address || loc.name || loc.formatted_address || loc.formattedAddress)) || null;

  return (
    nested ||
    request?.locationText ||
    request?.location_text ||
    request?.location_name ||
    request?.location_address ||
    request?.pickup_location ||
    request?.pickupLocation ||
    request?.address ||
    request?.address_line ||
    request?.addressLine ||
    request?.city ||
    request?.area ||
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
    const okLocation = containsNormalized(extractLocationText(r), locationNeedle);
    const okIssue = containsNormalized(r?.issueDescription || "", issueNeedle);
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
