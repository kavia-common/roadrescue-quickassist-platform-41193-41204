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
     * Attachment expected automation:
     * - set mechanic_id
     * - status = 'assigned'
     * - set assigned_at
     *
     * RLS: block mechanic actions unless approved=true (enforced by DB policies).
     */
    ensureSeedData();

    const supabase = getSupabase();
    if (supabase) {
      const authedUser = await requireSupabaseUser(supabase);
      const mechanicId = authedUser.id;
      const mechanicEmail = authedUser.email || mechanic.email;

      const existing = await this.getRequestById(requestId);
      if (!existing) throw new Error("Request not found.");

      if (existing.assignedMechanicId && existing.assignedMechanicId !== mechanicId) {
        throw new Error("This request was already assigned to another mechanic.");
      }

      const assignedAt = new Date().toISOString();

      // Try updating the attachment schema first: mechanic_id / assigned_at / status='assigned'
      // If those columns don't exist, fall back to legacy assigned_mechanic_* and status='ASSIGNED'.
      const updatePayloadPreferred = {
        mechanic_id: mechanicId,
        status: "assigned",
        assigned_at: assignedAt,
      };

      let updatedRow = null;
      const { data: updated1, error: err1 } = await supabase.from("requests").update(updatePayloadPreferred).eq("id", requestId).select("*").maybeSingle();

      if (!err1) {
        updatedRow = updated1;
      } else if (isMissingColumnError(err1)) {
        const updatePayloadLegacy = {
          assigned_mechanic_id: mechanicId,
          assigned_mechanic_email: mechanicEmail,
          status: "ASSIGNED",
          // some schemas may still have assigned_at; try but do not assume.
          assigned_at: assignedAt,
        };

        const { data: updated2, error: err2 } = await supabase.from("requests").update(updatePayloadLegacy).eq("id", requestId).select("*").maybeSingle();
        if (err2) throw new Error(friendlySupabaseErrorMessage(err2, "Could not accept this request."));
        updatedRow = updated2;
      } else {
        throw new Error(friendlySupabaseErrorMessage(err1, "Could not accept this request."));
      }

      // Add a service note. Prefer request_notes; fall back to embedding in requests.notes.
      const noteText = "Accepted request.";
      const noteAt = new Date().toISOString();

      const inserted = await insertRequestNote(supabase, { requestId, authorRole: "mechanic", noteText });
      if (!inserted.supported) {
        // Fallback: append to json notes field (if present).
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

      return updatedRow ? await this.getRequestById(requestId) : true;
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
     * Attachment flow: assigned -> in_progress -> completed
     * UI currently uses EN_ROUTE/WORKING/COMPLETED; we map those to in_progress/completed.
     */
    ensureSeedData();
    const canonical = normalizeStatus(status);
    const supabase = getSupabase();

    if (supabase) {
      const authedUser = await requireSupabaseUser(supabase);
      const mechanicId = authedUser.id;

      // Map canonical UI tokens to attachment schema statuses:
      // - ASSIGNED -> assigned
      // - EN_ROUTE/WORKING -> in_progress
      // - COMPLETED -> completed
      const mapped =
        canonical === "COMPLETED"
          ? "completed"
          : canonical === "ASSIGNED"
            ? "assigned"
            : canonical === "OPEN"
              ? "open"
              : "in_progress";

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

      const completedAt = mapped === "completed" ? new Date().toISOString() : null;

      // Prefer attachment schema update
      const preferredPayload = completedAt
        ? { status: mapped, completed_at: completedAt }
        : { status: mapped };

      const { error: err1 } = await supabase.from("requests").update(preferredPayload).eq("id", requestId);

      if (err1) {
        if (isMissingColumnError(err1)) {
          // Fall back to legacy schema: status tokens are stored uppercase and no completed_at.
          const { error: err2 } = await supabase.from("requests").update({ status: canonical }).eq("id", requestId);
          if (err2) throw new Error(friendlySupabaseErrorMessage(err2, "Could not update status."));
        } else {
          throw new Error(friendlySupabaseErrorMessage(err1, "Could not update status."));
        }
      }

      // Add a note (request_notes preferred).
      const noteToWrite = (noteText || "").trim() || `Status changed to ${canonical}.`;
      const inserted = await insertRequestNote(supabase, { requestId, authorRole: "mechanic", noteText: noteToWrite });
      if (!inserted.supported) {
        // Fallback to embedding JSON notes
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
