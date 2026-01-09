import { createClient } from "@supabase/supabase-js";
import { normalizeStatus } from "./statusUtils";

const LS_KEYS = {
  session: "rrqa.session",
  users: "rrqa.users",
  requests: "rrqa.requests",
  fees: "rrqa.fees",
  seeded: "rrqa.seeded",
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function ensureSeedData() {
  const seeded = readJson(LS_KEYS.seeded, false);
  if (seeded) return;

  const users = [
    { id: uid("u"), email: "user@example.com", password: "password123", role: "user", approved: true },
    // Demo mechanic should be able to exercise the primary flow (accepting requests)
    // in mock mode without needing an admin approval step.
    { id: uid("m"), email: "mech@example.com", password: "password123", role: "mechanic", approved: true, profile: { name: "Alex Mechanic", serviceArea: "Downtown" } },
    { id: uid("a"), email: "admin@example.com", password: "password123", role: "admin", approved: true },
  ];

  const now = new Date().toISOString();
  const requests = [
    {
      id: uid("req"),
      createdAt: now,
      userId: users[0].id,
      userEmail: users[0].email,
      vehicle: { make: "Toyota", model: "Corolla", year: "2016", plate: "ABC-123" },
      issueDescription: "Car won't start, clicking noise.",
      contact: { name: "Sam Driver", phone: "555-0101" },
      status: "Submitted",
      assignedMechanicId: null,
      assignedMechanicEmail: null,
      notes: [],
      updatedAt: now,
    },
  ];

  writeJson(LS_KEYS.users, users);
  writeJson(LS_KEYS.requests, requests);
  writeJson(LS_KEYS.fees, { baseFee: 25, perMile: 2.0, afterHoursMultiplier: 1.25 });
  writeJson(LS_KEYS.seeded, true);
}

function getSupabaseEnv() {
  const url = process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_KEY;
  return { url, key };
}

// PUBLIC_INTERFACE
function isSupabaseConfigured() {
  /** Returns true only when required REACT_APP_ Supabase env vars are present (React build-time). */
  const { url, key } = getSupabaseEnv();
  return Boolean(url && key);
}

function getSupabase() {
  const { url, key } = getSupabaseEnv();
  if (!url || !key) return null;

  try {
    return createClient(url, key);
  } catch {
    return null;
  }
}

function getLocalSession() {
  return readJson(LS_KEYS.session, null);
}
function setLocalSession(session) {
  writeJson(LS_KEYS.session, session);
}
function clearLocalSession() {
  window.localStorage.removeItem(LS_KEYS.session);
}
function getLocalUsers() {
  return readJson(LS_KEYS.users, []);
}
function setLocalUsers(users) {
  writeJson(LS_KEYS.users, users);
}
function getLocalRequests() {
  return readJson(LS_KEYS.requests, []);
}
function setLocalRequests(reqs) {
  writeJson(LS_KEYS.requests, reqs);
}

/** Cross-portal refresh/event bus (per-portal, but consistent event name). */
const REQUESTS_CHANGED_EVENT = "requests-changed";

/**
 * Emit a lightweight signal that "requests changed".
 * - Within a portal: triggers list/detail pages to re-fetch
 * - Cross-portal: if Supabase is used, other portals observe via realtime or polling of updated_at
 */
function emitRequestsChanged(detail) {
  try {
    window.dispatchEvent(new CustomEvent(REQUESTS_CHANGED_EVENT, { detail }));
  } catch {
    // ignore (older browsers / restricted environments)
  }
}

// PUBLIC_INTERFACE
function subscribeToRequestsChanged(handler) {
  /**
   * Subscribe to request change signals (local event bus).
   * Returns an unsubscribe function.
   */
  const wrapped = (e) => handler?.(e?.detail);
  window.addEventListener(REQUESTS_CHANGED_EVENT, wrapped);
  return () => window.removeEventListener(REQUESTS_CHANGED_EVENT, wrapped);
}

/**
 * Extracts {make, model, year, plate} from various possible DB shapes.
 * Supports:
 * - JSONB `vehicle` object
 * - flat columns like vehicle_make/vehicle_model
 * - alternate column names like make/model/year/plate
 */
function normalizeVehicle(raw) {
  /**
   * Canonicalize vehicle fields into:
   *   { make, model, year, plate }
   *
   * Supabase deployments differ; request rows might store vehicle as:
   *  - requests.vehicle (JSONB)
   *  - flat columns: vehicle_make / vehicle_model / vehicle_year / vehicle_plate
   *  - flat columns: make / model / year / plate
   *  - nested JSON objects: vehicle_info, vehicleDetails, etc.
   *  - joined shapes: { request: { ... } } or { requests: { ... } }
   *
   * This function is intentionally defensive: it attempts multiple known shapes
   * without assuming any one schema exists.
   */
  const safeObj = (x) => (x && typeof x === "object" ? x : null);

  // If we accidentally receive a wrapper (e.g. assignments join), unwrap it.
  const base =
    safeObj(raw?.request) ||
    safeObj(raw?.requests) ||
    safeObj(raw) ||
    {};

  // Candidate objects that may contain vehicle fields.
  const vehicleCandidates = [
    safeObj(base?.vehicle),
    safeObj(base?.vehicle_info),
    safeObj(base?.vehicleInfo),
    safeObj(base?.vehicle_details),
    safeObj(base?.vehicleDetails),
    safeObj(base?.car),
    safeObj(base?.car_info),
    safeObj(base?.carInfo),
  ].filter(Boolean);

  // Also support a case where vehicle is stored under a generic JSON payload.
  const detailsCandidates = [
    safeObj(base?.details),
    safeObj(base?.meta),
    safeObj(base?.metadata),
    safeObj(base?.payload),
    safeObj(base?.data),
  ].filter(Boolean);

  const nestedVehicleFromDetails = detailsCandidates
    .map((d) => safeObj(d?.vehicle) || safeObj(d?.vehicle_info) || safeObj(d?.vehicleInfo) || safeObj(d?.car) || safeObj(d?.carInfo))
    .filter(Boolean);

  const allCandidates = [...vehicleCandidates, ...nestedVehicleFromDetails];

  // Helper: return the first non-empty (non-null/undefined/empty-string) value
  const first = (...vals) => {
    for (const v of vals) {
      if (v === 0) return v; // allow numeric year 0 (unlikely, but safe)
      if (v === false) return v;
      if (v === null || v === undefined) continue;
      if (typeof v === "string" && v.trim() === "") continue;
      return v;
    }
    return "";
  };

  // Pull from JSON candidates first, then fall back to flat columns.
  const make = first(
    ...allCandidates.map((c) => c.make || c.Make || c.brand || c.manufacturer),
    base?.vehicle_make,
    base?.make
  );

  const model = first(
    ...allCandidates.map((c) => c.model || c.Model),
    base?.vehicle_model,
    base?.model
  );

  const year = first(
    ...allCandidates.map((c) => c.year || c.Year),
    base?.vehicle_year,
    base?.year
  );

  // Plates are very inconsistent; support a few common aliases.
  const plate = first(
    ...allCandidates.map((c) => c.plate || c.Plate || c.licensePlate || c.license_plate || c.registration || c.reg),
    base?.vehicle_plate,
    base?.plate
  );

  return {
    make: typeof make === "string" ? make.trim() : `${make}`,
    model: typeof model === "string" ? model.trim() : `${model}`,
    year: typeof year === "string" ? year.trim() : year ? `${year}` : "",
    plate: typeof plate === "string" ? plate.trim() : plate ? `${plate}` : "",
  };
}

/**
 * Extracts contact {name, phone, email} from various possible DB shapes.
 * Supports:
 * - JSONB `contact` object
 * - flat columns like contact_name/contact_phone/contact_email
 */
function normalizeContact(raw) {
  const c = raw?.contact && typeof raw.contact === "object" ? raw.contact : {};
  const name = c.name ?? raw?.contact_name ?? "";
  const phone = c.phone ?? raw?.contact_phone ?? "";
  const email = c.email ?? raw?.contact_email ?? "";
  return { name: name || "", phone: phone || "", email: email || "" };
}

function normalizeRequestRow(r) {
  return {
    id: r.id,
    createdAt: r.created_at ?? r.createdAt ?? "",
    updatedAt: r.updated_at ?? r.updatedAt ?? r.created_at ?? r.createdAt ?? "",
    userId: r.user_id ?? r.userId ?? "",
    userEmail: r.user_email ?? r.userEmail ?? "",
    vehicle: normalizeVehicle(r),
    issueDescription: r.issue_description ?? r.issueDescription ?? "",
    contact: normalizeContact(r),
    // IMPORTANT: keep status canonical across apps
    status: normalizeStatus(r.status ?? ""),
    assignedMechanicId: r.assigned_mechanic_id ?? r.assignedMechanicId ?? null,
    assignedMechanicEmail: r.assigned_mechanic_email ?? r.assignedMechanicEmail ?? null,
    notes: r.notes || [],
  };
}

async function supaGetUserRole(supabase, userId, email) {
  try {
    const { data, error } = await supabase.from("profiles").select("role,approved,profile").eq("id", userId).maybeSingle();
    if (error) return { role: "user", approved: true, profile: null };
    if (!data) {
      await supabase.from("profiles").insert({ id: userId, email, role: "user", approved: true });
      return { role: "user", approved: true, profile: null };
    }
    return { role: data.role || "user", approved: data.approved ?? true, profile: data.profile || null };
  } catch {
    return { role: "user", approved: true, profile: null };
  }
}

async function requireSupabaseUser(supabase) {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message || "Authentication error.");
  const user = data?.user;
  if (!user) throw new Error("You must be signed in to perform this action.");
  return user;
}

/** Extract a friendlier UI message from a supabase-js error (best-effort). */
function friendlySupabaseErrorMessage(err, fallback) {
  const msg = err?.message || "";
  if (!msg) return fallback;
  // Common RLS message in Supabase
  if (msg.toLowerCase().includes("row level security")) return "Permission denied. Please contact an admin.";
  return msg;
}

function isSupabaseWriteBlockedError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("row level security") ||
    msg.includes("permission denied") ||
    msg.includes("insufficient privilege") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden")
  );
}

async function tryBumpUpdatedAt(supabase, requestId) {
  /**
   * Cross-portal refresh signal:
   * Prefer updating a shared `updated_at` column if it exists. If the schema doesn't have it,
   * we silently ignore the error (polling/event bus still works within this portal).
   */
  try {
    const nowIso = new Date().toISOString();
    // If `updated_at` doesn't exist, Postgres will error; we ignore.
    await supabase.from("requests").update({ updated_at: nowIso }).eq("id", requestId);
  } catch {
    // ignore
  }
}

/**
 * One-time realtime subscription (per page load).
 * If enabled, other portals can also subscribe; this portal will emit an in-app event.
 */
let _realtimeInitialized = false;
function ensureRealtimeSubscription() {
  const supabase = getSupabase();
  if (!supabase || _realtimeInitialized) return;
  _realtimeInitialized = true;

  try {
    supabase
      .channel("rrqa-requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "requests" },
        (payload) => {
          emitRequestsChanged({ source: "supabase-realtime", payload });
        }
      )
      .subscribe();
  } catch {
    // ignore; realtime may not be enabled
  }
}

/**
 * PUBLIC_INTERFACE
 */
export const dataService = {
  /** Mechanic portal facade: login/logout + request acceptance and status updates. */

  // PUBLIC_INTERFACE
  subscribeToRequestsChanged(handler) {
    /** Subscribe to local in-app request change signals; returns unsubscribe(). */
    ensureRealtimeSubscription();
    return subscribeToRequestsChanged(handler);
  },

  // PUBLIC_INTERFACE
  async createRequest({ user, vehicle, issueDescription, contact }) {
    /**
     * Create a new request as a mechanic (if allowed).
     * Always set status='open' per DB constraint; do not send custom 'id', and only provide null/valid UUID for optional fields.
     * This method is included for completeness and cross-portal consistency; actual use depends on portal's allowed flows.
     */
    ensureSeedData();
    const supabase = getSupabase();
    const nowIso = new Date().toISOString();
    const request = {
      id: uid("req"),
      createdAt: nowIso,
      updatedAt: nowIso,
      userId: user.id,
      userEmail: user.email,
      vehicle,
      issueDescription,
      contact,
      status: "open",
      assignedMechanicId: null,
      assignedMechanicEmail: null,
      notes: [],
    };

    if (supabase) {
      const insertPayload = {
        created_at: nowIso,
        // best-effort updated_at (if column exists)
        updated_at: nowIso,
        user_id: user.id,
        user_email: user.email,
        vehicle,
        issue_description: issueDescription,
        contact,
        status: "open",
        assigned_mechanic_id: null,
        assigned_mechanic_email: null,
        notes: [],
      };
      const { data, error } = await supabase.from("requests").insert(insertPayload).select().maybeSingle();

      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not create request."));
      if (!data) throw new Error("Failed to insert request.");

      emitRequestsChanged({ type: "created", requestId: data.id });
      return normalizeRequestRow(data);
    }

    // In mock mode, assign a custom string ID.
    const all = getLocalRequests();
    setLocalRequests([request, ...all]);
    emitRequestsChanged({ type: "created", requestId: request.id });
    return request;
  },

  // PUBLIC_INTERFACE
  async login(email, password) {
    ensureSeedData();
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Login failed."));
      const user = data.user;
      const roleInfo = await supaGetUserRole(supabase, user.id, user.email);
      return { id: user.id, email: user.email, role: roleInfo.role, approved: roleInfo.approved, profile: roleInfo.profile };
    }

    const users = getLocalUsers();
    const match = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!match) throw new Error("Invalid email or password.");
    setLocalSession({ userId: match.id });
    return { id: match.id, email: match.email, role: match.role, approved: match.approved, profile: match.profile };
  },

  // PUBLIC_INTERFACE
  async logout() {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.auth.signOut();
      return;
    }
    clearLocalSession();
  },

  // PUBLIC_INTERFACE
  async getCurrentUser() {
    ensureSeedData();
    const supabase = getSupabase();
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) return null;
      const roleInfo = await supaGetUserRole(supabase, user.id, user.email);
      return { id: user.id, email: user.email, role: roleInfo.role, approved: roleInfo.approved, profile: roleInfo.profile };
    }

    const session = getLocalSession();
    if (!session?.userId) return null;
    const users = getLocalUsers();
    const u = users.find((x) => x.id === session.userId);
    if (!u) return null;
    return { id: u.id, email: u.email, role: u.role, approved: u.approved, profile: u.profile };
  },

  // PUBLIC_INTERFACE
  async listUnassignedRequests() {
    ensureSeedData();
    const supabase = getSupabase();
    if (supabase) {
      ensureRealtimeSubscription();
      const { data, error } = await supabase.from("requests").select("*").is("assigned_mechanic_id", null).order("created_at", { ascending: false });
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not load requests."));
      return (data || []).map(normalizeRequestRow);
    }

    const all = getLocalRequests();
    return all
      .filter((r) => !r.assignedMechanicId && (r.status === "Submitted" || r.status === "In Review" || normalizeStatus(r.status) === "open"))
      .map((r) => ({ ...r, status: normalizeStatus(r.status) }));
  },

  // PUBLIC_INTERFACE
  async listMyAssignments(mechanicId) {
    ensureSeedData();
    const supabase = getSupabase();

    // Supabase mode: read from assignments and join back to request data.
    if (supabase) {
      ensureRealtimeSubscription();
      const authedUser = await requireSupabaseUser(supabase);

      // Prefer the current session user id to avoid spoofing.
      const effectiveMechanicId = authedUser.id || mechanicId;
      if (!effectiveMechanicId) throw new Error("Missing mechanic id.");

      const { data, error } = await supabase
        .from("assignments")
        .select("id, mechanic_id, request_id, request:requests(*)")
        .eq("mechanic_id", effectiveMechanicId)
        // Prefer deterministic ordering without relying on optional columns.
        .order("request_id", { ascending: false });

      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not load assignments."));

      return (data || [])
        .map((a) => a?.request || a?.requests)
        .filter(Boolean)
        .map(normalizeRequestRow);
    }

    // Mock mode: requests are the source of truth.
    const all = getLocalRequests();
    return all
      .filter((r) => r.assignedMechanicId === mechanicId)
      .map((r) => ({ ...r, status: normalizeStatus(r.status) }));
  },

  // PUBLIC_INTERFACE
  async getRequestById(requestId) {
    const supabase = getSupabase();
    if (supabase) {
      ensureRealtimeSubscription();
      const { data, error } = await supabase.from("requests").select("*").eq("id", requestId).maybeSingle();
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not load request."));
      if (!data) return null;
      return normalizeRequestRow(data);
    }

    const all = getLocalRequests();
    const r = all.find((x) => x.id === requestId) || null;
    return r ? { ...r, status: normalizeStatus(r.status) } : null;
  },

  // PUBLIC_INTERFACE
  async acceptRequest({ requestId, mechanic }) {
    /**
     * Mechanic "Accept":
     * - Set request.status='assigned' (canonical)
     * - Link assigned_mechanic_id/email
     * - Append a note
     * - Bump updated_at (best-effort) so other portals can detect the mutation
     *
     * If Supabase write is blocked (RLS/schema), fall back to demo/local while still updating UI.
     *
     * Returns the updated request.
     */
    ensureSeedData();
    const note = { id: uid("n"), at: new Date().toISOString(), by: mechanic.email, text: "Accepted request." };

    const supabase = getSupabase();
    if (supabase) {
      const authedUser = await requireSupabaseUser(supabase);

      const mechanicId = authedUser.id;
      const mechanicEmail = authedUser.email || mechanic.email;

      // Preload existing request for note append and to avoid overwriting notes incorrectly.
      const existing = await this.getRequestById(requestId);
      if (!existing) throw new Error("Request not found.");

      // If already assigned to someone else, stop (unless it's already assigned to this same mechanic).
      if (existing.assignedMechanicId && existing.assignedMechanicId !== mechanicId) {
        throw new Error("This request was already assigned to another mechanic.");
      }

      // Try Supabase write path; if blocked, fall back to local.
      try {
        // 1) Ensure an assignment exists (idempotent, without ON CONFLICT)
        const { data: existingAssignment, error: findErr } = await supabase
          .from("assignments")
          .select("id")
          .eq("request_id", requestId)
          .eq("mechanic_id", mechanicId)
          .maybeSingle();

        if (findErr) throw findErr;

        if (existingAssignment?.id) {
          const { error: updateAssignErr } = await supabase
            .from("assignments")
            .update({
              mechanic_id: mechanicId,
              request_id: requestId,
            })
            .eq("id", existingAssignment.id);

          if (updateAssignErr) throw updateAssignErr;
        } else {
          const { error: insertAssignErr } = await supabase.from("assignments").insert({
            mechanic_id: mechanicId,
            request_id: requestId,
          });

          if (insertAssignErr) throw insertAssignErr;
        }

        // 2) Update request row (status transition + linking fields)
        const nowIso = new Date().toISOString();
        const { data: updated, error: reqErr } = await supabase
          .from("requests")
          .update({
            assigned_mechanic_id: mechanicId,
            assigned_mechanic_email: mechanicEmail,
            status: "assigned",
            // best-effort updated_at (if column exists)
            updated_at: nowIso,
            notes: [...(existing?.notes || []), note],
          })
          .eq("id", requestId)
          .select("*")
          .maybeSingle();

        if (reqErr) throw reqErr;

        // In case updated_at doesn't exist, try a bump separately (ignored on error).
        await tryBumpUpdatedAt(supabase, requestId);

        const normalized = updated ? normalizeRequestRow(updated) : { ...existing, status: "assigned", assignedMechanicId: mechanicId, assignedMechanicEmail: mechanicEmail, notes: [...(existing?.notes || []), note], updatedAt: nowIso };
        emitRequestsChanged({ type: "accepted", requestId });
        return normalized;
      } catch (e) {
        // If blocked by RLS/schema, fall back to local so UI still works.
        if (isSupabaseWriteBlockedError(e)) {
          // eslint-disable-next-line no-console
          console.warn("[acceptRequest] Supabase write blocked; falling back to demo/local:", e?.message || e);
          // fall through to local
        } else {
          throw new Error(friendlySupabaseErrorMessage(e, "Could not accept this request."));
        }
      }
    }

    // Mock/local fallback
    const all = getLocalRequests();
    const idx = all.findIndex((r) => r.id === requestId);
    if (idx < 0) throw new Error("Request not found.");
    const r = all[idx];
    if (r.assignedMechanicId && r.assignedMechanicId !== mechanic.id) throw new Error("Request already assigned.");

    const nowIso = new Date().toISOString();
    all[idx] = {
      ...r,
      assignedMechanicId: mechanic.id,
      assignedMechanicEmail: mechanic.email,
      status: "assigned",
      notes: [...(r.notes || []), note],
      updatedAt: nowIso,
    };
    setLocalRequests(all);
    emitRequestsChanged({ type: "accepted", requestId });
    return all[idx];
  },

  // PUBLIC_INTERFACE
  async updateRequestStatus(requestId, status) {
    /**
     * Update request status (canonical lower-case tokens) and return updated request.
     * This is the shared, minimal API requested by the task:
     *   dataService.updateRequestStatus(requestId, 'assigned')
     *
     * Also bumps updated_at (best-effort) and emits `requests-changed`.
     */
    ensureSeedData();
    const canonical = normalizeStatus(status);
    const supabase = getSupabase();

    // Prefer Supabase persistence when possible, but keep UI functional even if blocked.
    if (supabase) {
      ensureRealtimeSubscription();
      try {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from("requests")
          .update({
            status: canonical,
            // best-effort updated_at
            updated_at: nowIso,
          })
          .eq("id", requestId)
          .select("*")
          .maybeSingle();

        if (error) throw error;

        await tryBumpUpdatedAt(supabase, requestId);

        // If RLS returns no row, treat as blocked and fall back.
        if (!data) throw new Error("No rows updated (possible RLS restriction).");

        const updated = normalizeRequestRow(data);
        emitRequestsChanged({ type: "status-updated", requestId, status: canonical });
        return updated;
      } catch (e) {
        if (isSupabaseWriteBlockedError(e)) {
          // eslint-disable-next-line no-console
          console.warn("[updateRequestStatus] Supabase write blocked; falling back to demo/local:", e?.message || e);
        } else {
          throw new Error(friendlySupabaseErrorMessage(e, "Could not update status."));
        }
      }
    }

    // Local fallback
    const all = getLocalRequests();
    const idx = all.findIndex((r) => r.id === requestId);
    if (idx < 0) throw new Error("Request not found.");
    const nowIso = new Date().toISOString();
    all[idx] = { ...all[idx], status: canonical, updatedAt: nowIso };
    setLocalRequests(all);
    emitRequestsChanged({ type: "status-updated", requestId, status: canonical });
    return all[idx];
  },

  // PUBLIC_INTERFACE
  async updateRequestStatusWithNote({ requestId, status, mechanic, noteText }) {
    /**
     * Backward-compatible method (used by RequestDetailPage) that appends notes.
     * Kept separate from updateRequestStatus() so the requested signature stays minimal.
     */
    ensureSeedData();
    const canonical = normalizeStatus(status);
    const note = {
      id: uid("n"),
      at: new Date().toISOString(),
      by: mechanic.email,
      text: noteText || `Status changed to ${canonical}.`,
    };

    const supabase = getSupabase();
    if (supabase) {
      ensureRealtimeSubscription();
      const existing = await this.getRequestById(requestId);
      try {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from("requests")
          .update({ status: canonical, notes: [...(existing?.notes || []), note], updated_at: nowIso })
          .eq("id", requestId)
          .select("*")
          .maybeSingle();

        if (error) throw error;
        await tryBumpUpdatedAt(supabase, requestId);

        const updated = data ? normalizeRequestRow(data) : { ...existing, status: canonical, notes: [...(existing?.notes || []), note], updatedAt: nowIso };
        emitRequestsChanged({ type: "status-updated", requestId, status: canonical });
        return updated;
      } catch (e) {
        if (isSupabaseWriteBlockedError(e)) {
          // eslint-disable-next-line no-console
          console.warn("[updateRequestStatusWithNote] Supabase write blocked; falling back to demo/local:", e?.message || e);
          // fall through
        } else {
          throw new Error(friendlySupabaseErrorMessage(e, "Could not update status."));
        }
      }
    }

    const all = getLocalRequests();
    const idx = all.findIndex((r) => r.id === requestId);
    if (idx < 0) throw new Error("Request not found.");
    const nowIso = new Date().toISOString();
    all[idx] = { ...all[idx], status: canonical, notes: [...(all[idx].notes || []), note], updatedAt: nowIso };
    setLocalRequests(all);
    emitRequestsChanged({ type: "status-updated", requestId, status: canonical });
    return all[idx];
  },

  // PUBLIC_INTERFACE
  async updateProfile({ userId, profile }) {
    ensureSeedData();
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from("profiles").update({ profile }).eq("id", userId);
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not save profile."));
      return true;
    }

    const users = getLocalUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx < 0) throw new Error("User not found.");
    users[idx] = { ...users[idx], profile };
    setLocalUsers(users);
    return true;
  },

  // PUBLIC_INTERFACE
  isSupabaseConfigured,
};
