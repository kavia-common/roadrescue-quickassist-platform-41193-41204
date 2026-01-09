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
    {
      id: uid("m"),
      email: "mech@example.com",
      password: "password123",
      role: "mechanic",
      approved: true,
      // New flat fields used by Profile page:
      displayName: "Alex Mechanic",
      serviceArea: "Downtown",
      // Kept for backward compatibility with any older UI code:
      profile: { name: "Alex Mechanic", serviceArea: "Downtown" },
    },
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
      status: "OPEN",
      assignedMechanicId: null,
      assignedMechanicEmail: null,
      // UI expects "notes" as a history list.
      notes: [{ id: uid("n"), at: now, by: "System", text: "Request created." }],
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
 * - flat columns like vehicle_make/vehicle_model/vehicle_year/vehicle_plate
 * - alternate column names like make/model/year/plate
 */
function normalizeVehicle(raw) {
  const safeObj = (x) => (x && typeof x === "object" ? x : null);

  // If we accidentally receive a wrapper (e.g. join), unwrap it.
  const base = safeObj(raw?.request) || safeObj(raw?.requests) || safeObj(raw) || {};

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
  const detailsCandidates = [safeObj(base?.details), safeObj(base?.meta), safeObj(base?.metadata), safeObj(base?.payload), safeObj(base?.data)].filter(
    Boolean
  );

  const nestedVehicleFromDetails = detailsCandidates
    .map((d) => safeObj(d?.vehicle) || safeObj(d?.vehicle_info) || safeObj(d?.vehicleInfo) || safeObj(d?.car) || safeObj(d?.carInfo))
    .filter(Boolean);

  const allCandidates = [...vehicleCandidates, ...nestedVehicleFromDetails];

  const first = (...vals) => {
    for (const v of vals) {
      if (v === 0) return v;
      if (v === false) return v;
      if (v === null || v === undefined) continue;
      if (typeof v === "string" && v.trim() === "") continue;
      return v;
    }
    return "";
  };

  const make = first(...allCandidates.map((c) => c.make || c.Make || c.brand || c.manufacturer), base?.vehicle_make, base?.make);
  const model = first(...allCandidates.map((c) => c.model || c.Model), base?.vehicle_model, base?.model);
  const year = first(...allCandidates.map((c) => c.year || c.Year), base?.vehicle_year, base?.year);
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
  // Schema variance support:
  // - "mechanic_id" (requested by attachment) vs "assigned_mechanic_id" (older deployments)
  const mechanicId = r.mechanic_id ?? r.assigned_mechanic_id ?? r.assignedMechanicId ?? null;

  return {
    id: r.id,
    createdAt: r.created_at ?? r.createdAt ?? "",
    userId: r.user_id ?? r.userId ?? "",
    userEmail: r.user_email ?? r.userEmail ?? "",
    vehicle: normalizeVehicle(r),
    issueDescription: r.issue_description ?? r.issueDescription ?? "",
    contact: normalizeContact(r),
    address: r.address ?? "",
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    // IMPORTANT: keep status canonical across apps
    status: normalizeStatus(r.status ?? ""),
    assignedMechanicId: mechanicId,
    // Some schemas store mechanic email; not always present.
    assignedMechanicEmail: r.assigned_mechanic_email ?? r.assignedMechanicEmail ?? null,
    assignedAt: r.assigned_at ?? null,
    completedAt: r.completed_at ?? null,
    // Backward compatible: if the DB still has requests.notes (jsonb), we keep it.
    notes: r.notes || [],
  };
}

async function supaGetUserRole(supabase, userId, email) {
  try {
    /**
     * IMPORTANT:
     * Mechanic Portal uses flat columns:
     * - profiles.display_name (text)
     * - profiles.service_area (text)
     */
    const { data, error } = await supabase.from("profiles").select("role,approved,display_name,service_area").eq("id", userId).maybeSingle();

    if (error) return { role: "user", approved: true, displayName: "", serviceArea: "" };

    if (!data) {
      await supabase.from("profiles").insert({
        id: userId,
        email,
        role: "user",
        approved: true,
        display_name: "",
        service_area: "",
      });
      return { role: "user", approved: true, displayName: "", serviceArea: "" };
    }

    return {
      role: data.role || "user",
      approved: data.approved ?? true,
      displayName: data.display_name || "",
      serviceArea: data.service_area || "",
    };
  } catch {
    return { role: "user", approved: true, displayName: "", serviceArea: "" };
  }
}

async function requireSupabaseUser(supabase) {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message || "Authentication error.");
  const user = data?.user;
  if (!user) throw new Error("You must be signed in to perform this action.");
  return user;
}

/**
 * Atomic lifecycle update helpers (Supabase mode).
 *
 * These methods aim to be:
 * - Atomic at the row level (single update statement with preconditions)
 * - Consistent about timestamps (client-side ISO; DB may also have triggers)
 * - Compatible with schema variants used across environments (new: mechanic_id; legacy: assigned_mechanic_id)
 *
 * NOTE: We intentionally avoid raw SQL/rpc usage; everything is via supabase-js update filters.
 */

/**
 * Attempts an atomic accept (open -> assigned) using the newer schema columns first.
 * Falls back to legacy assigned_mechanic_* columns when needed.
 */
async function supaAtomicAcceptRequest(supabase, { requestId, mechanicId, assignedAtIso }) {
  // Newer schema: mechanic_id + assigned_at + status=assigned; guard on mechanic_id IS NULL.
  const preferred = {
    mechanic_id: mechanicId,
    status: "assigned",
    assigned_at: assignedAtIso,
  };

  const { data: row1, error: err1 } = await supabase
    .from("requests")
    .update(preferred)
    .eq("id", requestId)
    .is("mechanic_id", null)
    .select("*")
    .maybeSingle();

  if (!err1) {
    // If row1 is null, the guard prevented update (someone else assigned already).
    return { updated: Boolean(row1), row: row1, used: "preferred" };
  }

  if (!isMissingColumnError(err1)) {
    throw new Error(friendlySupabaseErrorMessage(err1, "Could not accept this request."));
  }

  // Legacy schema: assigned_mechanic_id + assigned_at + status=ASSIGNED; guard on assigned_mechanic_id IS NULL.
  const legacy = {
    assigned_mechanic_id: mechanicId,
    status: "ASSIGNED",
    assigned_at: assignedAtIso,
  };

  const { data: row2, error: err2 } = await supabase
    .from("requests")
    .update(legacy)
    .eq("id", requestId)
    .is("assigned_mechanic_id", null)
    .select("*")
    .maybeSingle();

  if (err2) throw new Error(friendlySupabaseErrorMessage(err2, "Could not accept this request."));
  return { updated: Boolean(row2), row: row2, used: "legacy" };
}

/**
 * Attempts an atomic start (assigned -> in_progress) for the newer schema first.
 * Falls back to legacy status-only update when needed.
 */
async function supaAtomicStartRequest(supabase, { requestId, mechanicId }) {
  // Newer schema: status=in_progress and only allow the assigned mechanic to start.
  const { data: row1, error: err1 } = await supabase
    .from("requests")
    .update({ status: "in_progress" })
    .eq("id", requestId)
    .eq("mechanic_id", mechanicId)
    .eq("status", "assigned")
    .select("*")
    .maybeSingle();

  if (!err1) return { updated: Boolean(row1), row: row1, used: "preferred" };

  if (!isMissingColumnError(err1)) {
    throw new Error(friendlySupabaseErrorMessage(err1, "Could not start request."));
  }

  // Legacy schema: set status to WORKING; cannot enforce previous status due to variant values.
  const { data: row2, error: err2 } = await supabase
    .from("requests")
    .update({ status: "WORKING" })
    .eq("id", requestId)
    .eq("assigned_mechanic_id", mechanicId)
    .select("*")
    .maybeSingle();

  if (err2) throw new Error(friendlySupabaseErrorMessage(err2, "Could not start request."));
  return { updated: Boolean(row2), row: row2, used: "legacy" };
}

/**
 * Attempts an atomic complete (in_progress -> completed) with completed_at.
 * Falls back to legacy status-only update when needed.
 */
async function supaAtomicCompleteRequest(supabase, { requestId, mechanicId, completedAtIso }) {
  // Newer schema: status=completed, set completed_at, and enforce prior status=in_progress.
  const { data: row1, error: err1 } = await supabase
    .from("requests")
    .update({ status: "completed", completed_at: completedAtIso })
    .eq("id", requestId)
    .eq("mechanic_id", mechanicId)
    .eq("status", "in_progress")
    .select("*")
    .maybeSingle();

  if (!err1) return { updated: Boolean(row1), row: row1, used: "preferred" };

  if (!isMissingColumnError(err1)) {
    throw new Error(friendlySupabaseErrorMessage(err1, "Could not complete request."));
  }

  // Legacy schema: status=COMPLETED, attempt completed_at (may or may not exist).
  const { data: row2, error: err2 } = await supabase
    .from("requests")
    .update({ status: "COMPLETED", completed_at: completedAtIso })
    .eq("id", requestId)
    .eq("assigned_mechanic_id", mechanicId)
    .select("*")
    .maybeSingle();

  if (err2) throw new Error(friendlySupabaseErrorMessage(err2, "Could not complete request."));
  return { updated: Boolean(row2), row: row2, used: "legacy" };
}

/** Extract a friendlier UI message from a supabase-js error (best-effort). */
function friendlySupabaseErrorMessage(err, fallback) {
  const msg = err?.message || "";
  if (!msg) return fallback;
  if (msg.toLowerCase().includes("row level security")) return "Permission denied. Please contact an admin.";
  return msg;
}

/** Best-effort: detect if a Postgres column is missing based on error message. */
function isMissingColumnError(err) {
  const msg = err?.message || "";
  return msg.toLowerCase().includes("column") && msg.toLowerCase().includes("does not exist");
}

/**
 * Load notes from the dedicated request_notes table.
 * Falls back to requests.notes jsonb if request_notes isn't available.
 */
async function loadRequestNotes(supabase, requestId) {
  // request_notes: { id, request_id, author_role, note, created_at }
  const { data, error } = await supabase
    .from("request_notes")
    .select("id,request_id,author_role,note,created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingColumnError(error) || (error.message || "").toLowerCase().includes("relation") || (error.message || "").toLowerCase().includes("schema cache")) {
      // Table/columns not present in this deployment; caller may fall back.
      return { notes: null, supported: false };
    }
    throw new Error(friendlySupabaseErrorMessage(error, "Could not load notes."));
  }

  const normalized = (data || []).map((n) => ({
    id: n.id,
    at: n.created_at,
    by: n.author_role || "mechanic",
    text: n.note || "",
  }));

  return { notes: normalized, supported: true };
}

async function insertRequestNote(supabase, { requestId, authorRole, noteText }) {
  const payload = {
    request_id: requestId,
    author_role: authorRole,
    note: noteText,
    // created_at usually defaulted by DB; sending it is optional. We avoid in case of triggers/defaults.
  };

  const { error } = await supabase.from("request_notes").insert(payload);
  if (error) {
    if (isMissingColumnError(error) || (error.message || "").toLowerCase().includes("relation") || (error.message || "").toLowerCase().includes("schema cache")) {
      return { supported: false };
    }
    throw new Error(friendlySupabaseErrorMessage(error, "Could not add note."));
  }
  return { supported: true };
}

/**
 * PUBLIC_INTERFACE
 */
export const dataService = {
  /** Mechanic portal facade: login/logout + request acceptance and status updates. */

  // PUBLIC_INTERFACE
  async createRequest({ user, vehicle, issueDescription, contact, address, latitude, longitude }) {
    /**
     * Create a new request (mostly used in other portals).
     * Status must start as OPEN/open depending on schema; we normalize in UI.
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
      address: address || "",
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      status: "OPEN",
      assignedMechanicId: null,
      assignedMechanicEmail: null,
      notes: [{ id: uid("n"), at: nowIso, by: "System", text: "Request created." }],
    };

    if (supabase) {
      // Try both schema variants:
      // - new: (mechanic_id, status='open')
      // - old: (assigned_mechanic_id, status='OPEN')
      const insertPayload = {
        created_at: nowIso,
        user_id: user.id,
        user_email: user.email,
        vehicle,
        issue_description: issueDescription,
        contact,
        address: address || "",
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        status: "open",
        mechanic_id: null,
      };

      const { data, error } = await supabase.from("requests").insert(insertPayload).select().maybeSingle();
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not create request."));
      if (!data) throw new Error("Failed to insert request.");

      const normalized = normalizeRequestRow(data);
      // If request_notes exists, also add an initial note.
      try {
        await insertRequestNote(supabase, { requestId: normalized.id, authorRole: "admin", noteText: "Request created." });
      } catch {
        // ignore; request creation must still succeed
      }
      return await this.getRequestById(normalized.id);
    }

    const all = getLocalRequests();
    setLocalRequests([request, ...all]);
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
      return {
        id: user.id,
        email: user.email,
        role: roleInfo.role,
        approved: roleInfo.approved,
        displayName: roleInfo.displayName,
        serviceArea: roleInfo.serviceArea,
      };
    }

    const users = getLocalUsers();
    const match = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!match) throw new Error("Invalid email or password.");
    setLocalSession({ userId: match.id });
    return {
      id: match.id,
      email: match.email,
      role: match.role,
      approved: match.approved,
      displayName: match.displayName || match.profile?.name || "",
      serviceArea: match.serviceArea || match.profile?.serviceArea || "",
    };
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
      return {
        id: user.id,
        email: user.email,
        role: roleInfo.role,
        approved: roleInfo.approved,
        displayName: roleInfo.displayName,
        serviceArea: roleInfo.serviceArea,
      };
    }

    const session = getLocalSession();
    if (!session?.userId) return null;
    const users = getLocalUsers();
    const u = users.find((x) => x.id === session.userId);
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      approved: u.approved,
      displayName: u.displayName || u.profile?.name || "",
      serviceArea: u.serviceArea || u.profile?.serviceArea || "",
    };
  },

  // PUBLIC_INTERFACE
  async listUnassignedRequests() {
    /**
     * Mechanic dashboard "Open" list:
     * Attachment expects: mechanics can view only open requests, and accept them.
     */
    ensureSeedData();
    const supabase = getSupabase();
    if (supabase) {
      // Prefer filtering by status='open' (per attachment). Also allow null mechanic_id.
      // Some schemas store OPEN/Submitted, but we keep it flexible.
      const { data, error } = await supabase
        .from("requests")
        .select("*")
        .or("status.eq.open,status.eq.OPEN,status.eq.Submitted,status.eq.IN_REVIEW,status.eq.In Review")
        .or("mechanic_id.is.null,assigned_mechanic_id.is.null")
        .order("created_at", { ascending: false });

      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not load requests."));
      // We still only want "unassigned"; if RLS already restricted, this is fine.
      return (data || [])
        .map(normalizeRequestRow)
        .filter((r) => !r.assignedMechanicId && normalizeStatus(r.status) === "OPEN");
    }

    const all = getLocalRequests();
    return all.filter((r) => !r.assignedMechanicId && normalizeStatus(r.status) === "OPEN");
  },

  // PUBLIC_INTERFACE
  async listMyAssignments(mechanicId) {
    /**
     * Mechanic "My Assignments" list:
     * Attachment expects mechanics can view requests where status='open' OR mechanic_id=auth.uid()
     */
    ensureSeedData();
    const supabase = getSupabase();

    if (supabase) {
      const authedUser = await requireSupabaseUser(supabase);
      const effectiveMechanicId = authedUser.id || mechanicId;
      if (!effectiveMechanicId) throw new Error("Missing mechanic id.");

      // Support both schema variants for mechanic_id/assigned_mechanic_id.
      const { data, error } = await supabase
        .from("requests")
        .select("*")
        .or(`mechanic_id.eq.${effectiveMechanicId},assigned_mechanic_id.eq.${effectiveMechanicId}`)
        .order("created_at", { ascending: false });

      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not load assignments."));
      return (data || []).map(normalizeRequestRow);
    }

    const all = getLocalRequests();
    return all.filter((r) => r.assignedMechanicId === mechanicId);
  },

  // PUBLIC_INTERFACE
  async getRequestById(requestId) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase.from("requests").select("*").eq("id", requestId).maybeSingle();
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not load request."));
      if (!data) return null;

      const base = normalizeRequestRow(data);

      // Preferred notes source: request_notes table
      try {
        const { notes, supported } = await loadRequestNotes(supabase, requestId);
        if (supported && Array.isArray(notes)) {
          return { ...base, notes };
        }
      } catch (e) {
        // If we cannot load notes for non-schema reasons, surface it (but do not hard-fail request view).
        // We keep the request visible and rely on any embedded notes.
        // eslint-disable-next-line no-console
        console.warn("Could not load request_notes:", e);
      }

      return base;
    }

    const all = getLocalRequests();
    return all.find((r) => r.id === requestId) || null;
  },

  // PUBLIC_INTERFACE
  async acceptRequest({ requestId, mechanic }) {
    /**
     * Accepting an open request assigns it to current mechanic.
     *
     * Atomic requirements:
     * - set mechanic_id (or legacy assigned_mechanic_id)
     * - status: open -> assigned
     * - set assigned_at
     *
     * We implement this with a single guarded update statement in Supabase mode.
     */
    ensureSeedData();

    const supabase = getSupabase();
    if (supabase) {
      const authedUser = await requireSupabaseUser(supabase);
      const mechanicId = authedUser.id;
      const mechanicEmail = authedUser.email || mechanic.email;

      const assignedAt = new Date().toISOString();

      const { updated } = await supaAtomicAcceptRequest(supabase, {
        requestId,
        mechanicId,
        assignedAtIso: assignedAt,
      });

      if (!updated) {
        // Either already assigned, or request doesn't exist, or status isn't open in the newer schema.
        // Provide a user-friendly message; caller will refresh list.
        throw new Error("This request was already accepted by someone else.");
      }

      // Add a service note. Prefer request_notes; fall back to embedding in requests.notes.
      const noteText = "Accepted request.";
      const noteAt = new Date().toISOString();

      // We need the current notes for fallback embedding.
      const existing = await this.getRequestById(requestId);

      const inserted = await insertRequestNote(supabase, { requestId, authorRole: "mechanic", noteText });
      if (!inserted.supported) {
        try {
          const safeExistingNotes = Array.isArray(existing?.notes) ? existing.notes : [];
          const fallbackNote = { id: uid("n"), at: noteAt, by: mechanicEmail || "mechanic", text: noteText };
          await supabase
            .from("requests")
            .update({
              notes: [...safeExistingNotes, fallbackNote],
            })
            .eq("id", requestId);
        } catch {
          // ignore; accept already succeeded
        }
      }

      return await this.getRequestById(requestId);
    }

    // Mock mode
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
      assignedAt: new Date().toISOString(),
      notes: [...(r.notes || []), { id: uid("n"), at: new Date().toISOString(), by: mechanic.email, text: "Accepted request." }],
    };
    setLocalRequests(all);
    return all[idx];
  },

  // PUBLIC_INTERFACE
  async updateRequestStatus({ requestId, status, mechanic, noteText }) {
    /**
     * Status updates for assigned requests.
     *
     * Attachment flow: assigned -> in_progress -> completed
     * UI currently uses ASSIGNED/WORKING/COMPLETED; we map those onto start/complete transitions.
     */
    ensureSeedData();
    const canonical = normalizeStatus(status);
    const supabase = getSupabase();

    if (supabase) {
      const authedUser = await requireSupabaseUser(supabase);
      const mechanicId = authedUser.id;

      const existing = await this.getRequestById(requestId);
      if (!existing) throw new Error("Request not found.");

      // Best-effort: if not assigned yet, require accept first (UI already does, but keep safe).
      const effectiveAssignedTo = existing.assignedMechanicId;
      if (!effectiveAssignedTo) {
        throw new Error("This request is not assigned yet. Accept it first.");
      }
      if (effectiveAssignedTo !== mechanicId) {
        throw new Error("You can only update requests assigned to you.");
      }

      /**
       * We treat transitions as:
       * - WORKING (or EN_ROUTE) => start (assigned -> in_progress)
       * - COMPLETED => complete (in_progress -> completed, completed_at set)
       * - ASSIGNED => no-op or keep assigned (but allow status write for compatibility)
       */
      if (canonical === "COMPLETED") {
        await supaAtomicCompleteRequest(supabase, {
          requestId,
          mechanicId,
          completedAtIso: new Date().toISOString(),
        });
      } else if (canonical === "WORKING" || canonical === "EN_ROUTE") {
        await supaAtomicStartRequest(supabase, { requestId, mechanicId });
      } else if (canonical === "ASSIGNED") {
        // Keep compatible: attempt to set assigned (no timestamps here; accept flow sets assigned_at).
        const { error } = await supabase.from("requests").update({ status: "assigned" }).eq("id", requestId).eq("mechanic_id", mechanicId);
        if (error && !isMissingColumnError(error)) {
          throw new Error(friendlySupabaseErrorMessage(error, "Could not update status."));
        }
        if (error && isMissingColumnError(error)) {
          const { error: e2 } = await supabase.from("requests").update({ status: "ASSIGNED" }).eq("id", requestId).eq("assigned_mechanic_id", mechanicId);
          if (e2) throw new Error(friendlySupabaseErrorMessage(e2, "Could not update status."));
        }
      } else {
        // OPEN shouldn't happen for assigned mechanics; treat as in_progress for safety.
        await supaAtomicStartRequest(supabase, { requestId, mechanicId });
      }

      // Add a note (request_notes preferred).
      const noteToWrite = (noteText || "").trim() || `Status changed to ${canonical}.`;
      const inserted = await insertRequestNote(supabase, { requestId, authorRole: "mechanic", noteText: noteToWrite });
      if (!inserted.supported) {
        try {
          const safeExistingNotes = Array.isArray(existing?.notes) ? existing.notes : [];
          const fallbackNote = { id: uid("n"), at: new Date().toISOString(), by: authedUser.email || mechanic.email, text: noteToWrite };
          await supabase
            .from("requests")
            .update({
              notes: [...safeExistingNotes, fallbackNote],
            })
            .eq("id", requestId);
        } catch {
          // ignore
        }
      }

      return true;
    }

    // Mock mode
    const all = getLocalRequests();
    const idx = all.findIndex((r) => r.id === requestId);
    if (idx < 0) throw new Error("Request not found.");

    const mappedStatus = canonical === "COMPLETED" ? "COMPLETED" : canonical === "ASSIGNED" ? "ASSIGNED" : "WORKING";
    const note = {
      id: uid("n"),
      at: new Date().toISOString(),
      by: mechanic.email,
      text: (noteText || "").trim() || `Status changed to ${canonical}.`,
    };

    all[idx] = {
      ...all[idx],
      status: mappedStatus,
      completedAt: canonical === "COMPLETED" ? new Date().toISOString() : all[idx].completedAt,
      notes: [...(all[idx].notes || []), note],
    };
    setLocalRequests(all);
    return true;
  },

  // PUBLIC_INTERFACE
  async updateProfile({ userId, displayName, serviceArea }) {
    ensureSeedData();
    const supabase = getSupabase();
    if (supabase) {
      /**
       * Expected flat columns on `profiles`:
       * - display_name (text)
       * - service_area (text)
       */
      const payload = {
        display_name: (displayName || "").trim(),
        service_area: (serviceArea || "").trim(),
      };

      const { error } = await supabase.from("profiles").update(payload).eq("id", userId);
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not save profile."));
      return true;
    }

    const users = getLocalUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx < 0) throw new Error("User not found.");
    users[idx] = {
      ...users[idx],
      displayName: (displayName || "").trim(),
      serviceArea: (serviceArea || "").trim(),
      profile: {
        name: (displayName || "").trim(),
        serviceArea: (serviceArea || "").trim(),
      },
    };
    setLocalUsers(users);
    return true;
  },

  // PUBLIC_INTERFACE
  isSupabaseConfigured,
};
