import { createClient } from "@supabase/supabase-js";

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
  const v = raw?.vehicle && typeof raw.vehicle === "object" ? raw.vehicle : {};
  const make = v.make ?? raw?.vehicle_make ?? raw?.make ?? "";
  const model = v.model ?? raw?.vehicle_model ?? raw?.model ?? "";
  const year = v.year ?? raw?.vehicle_year ?? raw?.year ?? "";
  const plate = v.plate ?? raw?.vehicle_plate ?? raw?.plate ?? "";
  return {
    make: make || "",
    model: model || "",
    year: year || "",
    plate: plate || "",
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
    userId: r.user_id ?? r.userId ?? "",
    userEmail: r.user_email ?? r.userEmail ?? "",
    vehicle: normalizeVehicle(r),
    issueDescription: r.issue_description ?? r.issueDescription ?? "",
    contact: normalizeContact(r),
    status: r.status ?? "",
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
      const { data, error } = await supabase.from("requests").select("*").is("assigned_mechanic_id", null).order("created_at", { ascending: false });
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not load requests."));
      return (data || []).map(normalizeRequestRow);
    }

    const all = getLocalRequests();
    return all.filter((r) => !r.assignedMechanicId && (r.status === "Submitted" || r.status === "In Review"));
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
        .map(normalizeRequestRow);
    }

    // Mock mode: requests are the source of truth.
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
      return normalizeRequestRow(data);
    }

    const all = getLocalRequests();
    return all.find((r) => r.id === requestId) || null;
  },

  // PUBLIC_INTERFACE
  async acceptRequest({ requestId, mechanic }) {
    ensureSeedData();
    const note = { id: uid("n"), at: new Date().toISOString(), by: mechanic.email, text: "Accepted request." };

    const supabase = getSupabase();
    if (supabase) {
      const authedUser = await requireSupabaseUser(supabase);

      /**
       * Some deployments do not have a UNIQUE constraint that matches common upsert conflict targets
       * (e.g. request_id, or (request_id, mechanic_id)). Using upsert with an invalid ON CONFLICT
       * target triggers:
       *   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
       *
       * To stay schema-agnostic without requiring migrations, we use:
       * 1) SELECT for an existing assignment row for (request_id, mechanic_id)
       * 2) UPDATE by id if found, otherwise INSERT
       *
       * This preserves idempotency for repeated accepts by the same mechanic.
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
            // Keep values consistent; do NOT write accepted_at (may not exist).
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
      const { error: reqErr } = await supabase
        .from("requests")
        .update({
          assigned_mechanic_id: mechanicId,
          assigned_mechanic_email: mechanicEmail,
          status: "assigned", // prefer DB-friendly status transition; UI still supports showing any status string
          notes: [...(existing?.notes || []), note],
        })
        .eq("id", requestId);

      if (reqErr) {
        throw new Error(friendlySupabaseErrorMessage(reqErr, "Accepted assignment but failed to update request status."));
      }

      return true;
    }

    // Mock mode behavior intact
    const all = getLocalRequests();
    const idx = all.findIndex((r) => r.id === requestId);
    if (idx < 0) throw new Error("Request not found.");
    const r = all[idx];
    if (r.assignedMechanicId) throw new Error("Request already assigned.");
    all[idx] = {
      ...r,
      assignedMechanicId: mechanic.id,
      assignedMechanicEmail: mechanic.email,
      status: "Accepted",
      notes: [...(r.notes || []), note],
    };
    setLocalRequests(all);
    return true;
  },

  // PUBLIC_INTERFACE
  async updateRequestStatus({ requestId, status, mechanic, noteText }) {
    ensureSeedData();
    const note = { id: uid("n"), at: new Date().toISOString(), by: mechanic.email, text: noteText || `Status changed to ${status}.` };

    const supabase = getSupabase();
    if (supabase) {
      const existing = await this.getRequestById(requestId);
      const { error } = await supabase.from("requests").update({ status, notes: [...(existing?.notes || []), note] }).eq("id", requestId);
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not update status."));
      return true;
    }

    const all = getLocalRequests();
    const idx = all.findIndex((r) => r.id === requestId);
    if (idx < 0) throw new Error("Request not found.");
    all[idx] = { ...all[idx], status, notes: [...(all[idx].notes || []), note] };
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
