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
      // Location fields (mock mode seed example)
      address: "1 Market St, San Francisco, CA",
      lat: 37.7946,
      lon: -122.395,
      status: "Submitted",
      assignedMechanicId: null,
      assignedMechanicEmail: null,
      notes: [],
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
  const safeObj = (x) => (x && typeof x === "object" ? x : null);

  /**
   * Location data can be stored as:
   * - flat columns: address, lat, lon
   * - flat columns: latitude, longitude
   * - nested JSON: location { address, lat, lon } (or similar)
   *
   * We keep this extraction defensive to support schema variance.
   */
  const locationCandidate =
    safeObj(r?.location) ||
    safeObj(r?.breakdown_location) ||
    safeObj(r?.breakdownLocation) ||
    safeObj(r?.meta?.location) ||
    safeObj(r?.metadata?.location);

  const address =
    r.address ??
    r.breakdown_address ??
    r.breakdownAddress ??
    locationCandidate?.address ??
    locationCandidate?.displayName ??
    "";

  const lat =
    r.lat ??
    r.latitude ??
    locationCandidate?.lat ??
    locationCandidate?.latitude ??
    null;

  const lon =
    r.lon ??
    r.lng ??
    r.long ??
    r.longitude ??
    locationCandidate?.lon ??
    locationCandidate?.lng ??
    locationCandidate?.longitude ??
    null;

  /**
   * Normalize issue description from a variety of schema variants.
   * Common possibilities across deployments:
   * - issue_description (snake_case)
   * - issueDescription (camelCase)
   * - issue / description (generic)
   */
  const issueDescription =
    r.issue_description ??
    r.issueDescription ??
    r.issue ??
    r.description ??
    "";

  // Normalize notes into an array at the data layer so all UI consumers are safe.
  const notesRaw = r?.notes;
  const notes = Array.isArray(notesRaw)
    ? notesRaw
    : typeof notesRaw === "string" && notesRaw.trim()
      ? [{ id: "note_legacy_string", at: new Date().toISOString(), by: "System", text: notesRaw.trim() }]
      : [];

  // createdAt should be a usable ISO string; fall back safely.
  const createdAt = r.created_at ?? r.createdAt ?? "";

  return {
    id: r.id,
    createdAt: typeof createdAt === "string" ? createdAt : createdAt ? String(createdAt) : "",
    userId: r.user_id ?? r.userId ?? "",
    userEmail: r.user_email ?? r.userEmail ?? "",
    vehicle: normalizeVehicle(r),

    // Canonical UI field:
    issueDescription: typeof issueDescription === "string" ? issueDescription : String(issueDescription || ""),
    // Alias to support list renderers and any legacy code expecting DB naming:
    issue_description: typeof issueDescription === "string" ? issueDescription : String(issueDescription || ""),

    contact: normalizeContact(r),

    // Location fields (used by mechanic Request Detail map view)
    address: typeof address === "string" ? address : String(address || ""),
    lat,
    lon,

    // IMPORTANT: keep status canonical across apps
    status: normalizeStatus(r.status ?? ""),
    assignedMechanicId: r.assigned_mechanic_id ?? r.assignedMechanicId ?? null,
    assignedMechanicEmail: r.assigned_mechanic_email ?? r.assignedMechanicEmail ?? null,
    notes,
  };
}

/**
 * PUBLIC_INTERFACE
 */
export function normalizeRequest(req) {
  /**
   * Canonical request normalization layer for Mechanic Portal UI.
   *
   * Ensures the app can safely render requests from:
   * - Supabase rows (snake_case columns, JSONB columns)
   * - localStorage mock mode (camelCase fields)
   * - joined shapes (e.g., assignments -> request:requests(*))
   *
   * Guarantees at minimum:
   * - req.vehicle is an object {make, model, year, plate}
   * - req.issueDescription is a string
   * - req.notes is always an array (possibly empty)
   * - req.status is canonicalized via normalizeStatus()
   */
  if (!req || typeof req !== "object") return null;

  // If the record already looks normalized (our shape), still ensure notes is safe.
  const alreadyNormalized =
    typeof req.id === "string" &&
    req.vehicle &&
    typeof req.vehicle === "object" &&
    typeof (req.issueDescription ?? req.issue_description) !== "undefined";

  const base = alreadyNormalized ? req : normalizeRequestRow(req);

  // Safety net: normalize notes again in case a caller passed through mock data.
  const notesRaw = base?.notes;
  const notes = Array.isArray(notesRaw)
    ? notesRaw
    : typeof notesRaw === "string" && notesRaw.trim()
      ? [{ id: "note_legacy_string", at: new Date().toISOString(), by: "System", text: notesRaw.trim() }]
      : [];

  const issueDescription =
    base?.issueDescription ??
    base?.issue_description ??
    base?.issue ??
    base?.description ??
    "";

  return {
    ...base,
    vehicle: normalizeVehicle(base),
    issueDescription: typeof issueDescription === "string" ? issueDescription : String(issueDescription || ""),
    issue_description: typeof issueDescription === "string" ? issueDescription : String(issueDescription || ""),
    notes,
    status: normalizeStatus(base?.status ?? ""),
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

/**
 * PUBLIC_INTERFACE
 */
export const dataService = {
  /** Mechanic portal facade: login/logout + request acceptance and status updates. */

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

      return normalizeRequestRow(data);
    }

    // In mock mode, assign a custom string ID.
    const all = getLocalRequests();
    setLocalRequests([request, ...all]);
    return normalizeRequest(request);
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
      const { data, error } = await supabase.from("requests").select("*").is("assigned_mechanic_id", null).order("created_at", { ascending: false });
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not load requests."));
      return (data || []).map((r) => normalizeRequest(r)).filter(Boolean);
    }

    const all = getLocalRequests();
    return all
      .filter((r) => !r.assignedMechanicId && (r.status === "Submitted" || r.status === "In Review"))
      .map((r) => normalizeRequest(r))
      .filter(Boolean);
  },

  // PUBLIC_INTERFACE
  async listMyAssignments(mechanicId) {
    ensureSeedData();
    const supabase = getSupabase();

    // Supabase mode: read from assignments and join back to request data.
    if (supabase) {
      const authedUser = await requireSupabaseUser(supabase);

      // Prefer the current session user id to avoid spoofing.
      const effectiveMechanicId = authedUser.id || mechanicId;
      if (!effectiveMechanicId) throw new Error("Missing mechanic id.");

      /**
       * We expect an `assignments` table with a FK to `requests`:
       * - assignments: { id, mechanic_id, request_id, created_at? }
       * - requests: existing requests row
       *
       * IMPORTANT: Some deployments do NOT have assignments.accepted_at. Avoid selecting/ordering by it.
       *
       * This query shape assumes a relationship exists in Supabase:
       * assignments.request_id -> requests.id
       *
       * IMPORTANT (schema variance):
       * Different deployments store vehicle data differently:
       *  - requests.vehicle (JSONB)
       *  - or flat columns (vehicle_make/vehicle_model/...)
       *  - or make/model/year/plate columns
       *
       * Selecting columns that don't exist causes hard SQL errors like:
       *   "column requests_1.vehicle_plate does not exist"
       *
       * Therefore, we only select the joined request row as `*` and normalize vehicle/contact
       * in JS via normalizeRequestRow(). If `vehicle` exists as JSON, it'll be included; if not,
       * normalizeVehicle() will gracefully fall back to whatever flat fields are present.
       */
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
        .map((r) => normalizeRequest(r))
        .filter(Boolean);
    }

    // Mock mode: requests are the source of truth.
    const all = getLocalRequests();
    return all
      .filter((r) => r.assignedMechanicId === mechanicId)
      .map((r) => normalizeRequest(r))
      .filter(Boolean);
  },

  // PUBLIC_INTERFACE
  async getRequestById(requestId) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase.from("requests").select("*").eq("id", requestId).maybeSingle();
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not load request."));
      if (!data) return null;
      return normalizeRequest(data);
    }

    const all = getLocalRequests();
    const found = all.find((r) => r.id === requestId) || null;
    return found ? normalizeRequest(found) : null;
  },

  // PUBLIC_INTERFACE
  async acceptRequest({ requestId, mechanic }) {
    ensureSeedData();
    const note = { id: uid("n"), at: new Date().toISOString(), by: mechanic.email, text: "Accepted request." };

    const supabase = getSupabase();
    if (supabase) {
      const authedUser = await requireSupabaseUser(supabase);

      /**
       * Some deployments do not have a UNIQUE constraint that matches common upsert conflict targets.
       * To remain schema-agnostic, we do a SELECT then UPDATE/INSERT for assignments.
       *
       * Cross-app requirement:
       * - Supabase is the source of truth.
       * - On accept, write a professional canonical status to requests.status.
       *   We standardize on: ASSIGNED
       */
      const mechanicId = authedUser.id;
      const mechanicEmail = authedUser.email || mechanic.email;

      // Preload existing request for note append and to avoid overwriting notes incorrectly.
      const existing = await this.getRequestById(requestId);
      if (!existing) throw new Error("Request not found.");

      // If already assigned to someone else, stop (unless it's already assigned to this same mechanic).
      if (existing.assignedMechanicId && existing.assignedMechanicId !== mechanicId) {
        throw new Error("This request was already assigned to another mechanic.");
      }

      // 1) Ensure an assignment exists (idempotent, without ON CONFLICT)
      const { data: existingAssignment, error: findErr } = await supabase
        .from("assignments")
        .select("id")
        .eq("request_id", requestId)
        .eq("mechanic_id", mechanicId)
        .maybeSingle();

      if (findErr) {
        throw new Error(friendlySupabaseErrorMessage(findErr, "Could not accept this request."));
      }

      if (existingAssignment?.id) {
        const { error: updateAssignErr } = await supabase
          .from("assignments")
          .update({
            mechanic_id: mechanicId,
            request_id: requestId,
          })
          .eq("id", existingAssignment.id);

        if (updateAssignErr) {
          throw new Error(friendlySupabaseErrorMessage(updateAssignErr, "Could not accept this request."));
        }
      } else {
        const { error: insertAssignErr } = await supabase.from("assignments").insert({
          mechanic_id: mechanicId,
          request_id: requestId,
        });

        if (insertAssignErr) {
          throw new Error(friendlySupabaseErrorMessage(insertAssignErr, "Could not accept this request."));
        }
      }

      // 2) Update request row (status transition + linking fields)
      const { data: updated, error: reqErr } = await supabase
        .from("requests")
        .update({
          assigned_mechanic_id: mechanicId,
          assigned_mechanic_email: mechanicEmail,
          status: "ASSIGNED",
          notes: [...(existing?.notes || []), note],
        })
        .eq("id", requestId)
        .select("*")
        .maybeSingle();

      if (reqErr) {
        throw new Error(friendlySupabaseErrorMessage(reqErr, "Accepted assignment but failed to update request status."));
      }

      // Return updated request so caller can refresh UI immediately without re-querying if desired
      return updated ? normalizeRequestRow(updated) : true;
    }

    // Mock mode behavior intact (also standardize to canonical)
    const all = getLocalRequests();
    const idx = all.findIndex((r) => r.id === requestId);
    if (idx < 0) throw new Error("Request not found.");
    const r = all[idx];
    if (r.assignedMechanicId) throw new Error("Request already assigned.");
    all[idx] = {
      ...r,
      assignedMechanicId: mechanic.id,
      assignedMechanicEmail: mechanic.email,
      status: "ASSIGNED",
      notes: [...(Array.isArray(r.notes) ? r.notes : []), note],
    };
    setLocalRequests(all);
    return normalizeRequest(all[idx]);
  },

  // PUBLIC_INTERFACE
  async updateRequestStatus({ requestId, status, mechanic, noteText }) {
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
      const existing = await this.getRequestById(requestId);
      const { error } = await supabase
        .from("requests")
        .update({ status: canonical, notes: [...(existing?.notes || []), note] })
        .eq("id", requestId);
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not update status."));
      return true;
    }

    const all = getLocalRequests();
    const idx = all.findIndex((r) => r.id === requestId);
    if (idx < 0) throw new Error("Request not found.");
    const prevNotes = Array.isArray(all[idx].notes) ? all[idx].notes : [];
    all[idx] = { ...all[idx], status: canonical, notes: [...prevNotes, note] };
    setLocalRequests(all);
    return true;
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
