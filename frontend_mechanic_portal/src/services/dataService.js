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
      status: "OPEN",
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
  const detailsCandidates = [safeObj(base?.details), safeObj(base?.meta), safeObj(base?.metadata), safeObj(base?.payload), safeObj(base?.data)].filter(Boolean);

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
  const make = first(...allCandidates.map((c) => c.make || c.Make || c.brand || c.manufacturer), base?.vehicle_make, base?.make);

  const model = first(...allCandidates.map((c) => c.model || c.Model), base?.vehicle_model, base?.model);

  const year = first(...allCandidates.map((c) => c.year || c.Year), base?.vehicle_year, base?.year);

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
    // NOTE: Mechanic approval is NOT the `approved` boolean (legacy); it is `mechanic_status`.
    // Keep reading role/profile, but do not infer approval from here.
    const { data, error } = await supabase.from("profiles").select("role,profile").eq("id", userId).maybeSingle();
    if (error) return { role: "user", profile: null };
    if (!data) {
      // Best-effort: many setups have a DB trigger that creates profiles row.
      // If insert is blocked (RLS), we still proceed and let later calls fail with a friendly error.
      try {
        await supabase.from("profiles").insert({ id: userId, email, role: "user" });
      } catch {
        // ignore
      }
      return { role: "user", profile: null };
    }
    return { role: data.role || "user", profile: data.profile || null };
  } catch {
    return { role: "user", profile: null };
  }
}

async function supaGetMechanicStatus(supabase, userId) {
  /**
   * Mechanic approval state is stored in profiles.mechanic_status (per user_input_ref).
   * Expected values: 'pending' | 'approved' | 'rejected' | 'suspended'
   */
  try {
    const { data, error } = await supabase.from("profiles").select("mechanic_status").eq("id", userId).maybeSingle();
    if (error) return null;
    return data?.mechanic_status || null;
  } catch {
    return null;
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
 * Credits/fees support:
 * Some deployments deduct credits when a mechanic accepts a job.
 *
 * Because we don't have the authoritative attachment in this session, we implement a defensive,
 * schema-tolerant deduction strategy:
 * - If `credits` table exists, decrement `credits.balance` for the mechanic.
 * - Otherwise, if a `profiles.credits` numeric column exists, decrement it.
 * - Otherwise, proceed without deduction (but keep acceptance working).
 *
 * IMPORTANT: This is best-effort and should not block acceptance unless the DB explicitly
 * requires deduction (in which case the request update will fail and surface a friendly error).
 */
async function tryDeductCreditsBestEffort({ supabase, mechanicId, amount }) {
  if (!amount || amount <= 0) return { deducted: false };

  // 1) Try `credits` table: credits(user_id, balance)
  try {
    const { data: row, error: selErr } = await supabase.from("credits").select("user_id,balance").eq("user_id", mechanicId).maybeSingle();
    if (!selErr && row) {
      const balance = Number(row.balance ?? 0);
      if (Number.isNaN(balance)) return { deducted: false };
      if (balance < amount) throw new Error("Insufficient credits to accept this request.");
      const { error: updErr } = await supabase.from("credits").update({ balance: balance - amount }).eq("user_id", mechanicId);
      if (updErr) throw updErr;
      return { deducted: true, method: "credits.balance" };
    }
  } catch (e) {
    // If the table exists but we had a real constraint issue (e.g., insufficient), bubble that.
    const msg = e?.message || "";
    if (msg.includes("Insufficient credits")) throw e;
    // Otherwise, ignore and fall through.
  }

  // 2) Try profiles.credits numeric column
  try {
    const { data: profile, error: selErr } = await supabase.from("profiles").select("credits").eq("id", mechanicId).maybeSingle();
    if (!selErr && profile && typeof profile.credits !== "undefined") {
      const bal = Number(profile.credits ?? 0);
      if (Number.isNaN(bal)) return { deducted: false };
      if (bal < amount) throw new Error("Insufficient credits to accept this request.");
      const { error: updErr } = await supabase.from("profiles").update({ credits: bal - amount }).eq("id", mechanicId);
      if (updErr) throw updErr;
      return { deducted: true, method: "profiles.credits" };
    }
  } catch (e) {
    const msg = e?.message || "";
    if (msg.includes("Insufficient credits")) throw e;
  }

  return { deducted: false };
}

/**
 * Decide the acceptance fee to deduct, best-effort:
 * - Try `fees` table with one row (base_fee or accept_fee)
 * - Else default to 0 (do not block acceptance)
 */
async function getAcceptanceFeeBestEffort(supabase) {
  try {
    const { data, error } = await supabase.from("fees").select("*").limit(1).maybeSingle();
    if (error || !data) return 0;
    const v = Number(data.accept_fee ?? data.base_fee ?? data.baseFee ?? 0);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/**
 * PUBLIC_INTERFACE
 */
export const dataService = {
  /** Mechanic portal facade: login/logout + request acceptance and status updates. */

  // PUBLIC_INTERFACE
  async getMechanicStatus(userId) {
    /** Get mechanic application status ('pending'|'approved'|'rejected'|'suspended') or null if not found. */
    ensureSeedData();
    const supabase = getSupabase();
    if (supabase) {
      return await supaGetMechanicStatus(supabase, userId);
    }

    // Mock mode: treat approved flag as the status source of truth.
    const users = getLocalUsers();
    const u = users.find((x) => x.id === userId);
    if (!u) return null;
    return u.approved ? "approved" : "pending";
  },

  // PUBLIC_INTERFACE
  async registerMechanic({ fullName, email, password, phone, serviceArea, specialization }) {
    /**
     * Registration flow per user_input_ref (mechanic portal):
     * 1) Create Supabase auth user
     * 2) Ensure/update profiles row to set:
     *    - role='mechanic'
     *    - mechanic_status='pending'
     *    - phone/service_area/specialization
     * 3) (Optional/best-effort) insert user_roles row with role='mechanic'
     *
     * IMPORTANT: Do not reference a `mechanics` table.
     *
     * Mock mode: creates a local user with approved=true (so demo flow still works).
     */
    ensureSeedData();
    const supabase = getSupabase();

    if (supabase) {
      const siteUrl = process.env.REACT_APP_FRONTEND_URL || process.env.REACT_APP_SITE_URL || "";

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Best-effort redirect for email confirmations (if enabled on project).
          ...(siteUrl ? { emailRedirectTo: siteUrl } : {}),
          data: { full_name: fullName },
        },
      });

      if (signUpError) throw new Error(friendlySupabaseErrorMessage(signUpError, "Registration failed."));

      // In some Supabase configs, user may not be immediately available until email confirmation.
      // We try both signUpData.user and an explicit getUser fetch.
      const createdUser = signUpData?.user || (await supabase.auth.getUser())?.data?.user;
      if (!createdUser?.id) {
        throw new Error("Account created, but no active session. Please check your email for confirmation, then login.");
      }

      // Ensure there's a profiles row; if your DB already has an auth trigger that creates it,
      // this insert will likely conflict. We ignore that and proceed to update.
      try {
        await supabase.from("profiles").insert({ id: createdUser.id, email: createdUser.email, role: "user" });
      } catch {
        // ignore
      }

      // Authoritative mechanic fields live on `profiles` (per assets/supabase_mechanic_schema_cli.md).
      const updatePayload = {
        role: "mechanic",
        mechanic_status: "pending",
        phone: phone || null,
        service_area: serviceArea || null,
        specialization: Array.isArray(specialization) && specialization.length ? specialization : null,
      };

      const { error: profileErr } = await supabase.from("profiles").update(updatePayload).eq("id", createdUser.id);
      if (profileErr) throw new Error(friendlySupabaseErrorMessage(profileErr, "Could not submit mechanic application."));

      // Role row (best-effort; ignore duplicates if RLS allows/blocks)
      try {
        const { error: roleError } = await supabase.from("user_roles").insert({ user_id: createdUser.id, role: "mechanic" });
        if (roleError && !String(roleError.message || "").toLowerCase().includes("duplicate")) {
          // eslint-disable-next-line no-console
          console.warn("Could not insert user_roles row:", roleError);
        }
      } catch {
        // ignore
      }

      // Ensure returned user is treated as a mechanic and is NOT approved until mechanic_status says approved.
      const roleInfo = await supaGetUserRole(supabase, createdUser.id, createdUser.email);
      const mechStatus = await supaGetMechanicStatus(supabase, createdUser.id);

      return {
        id: createdUser.id,
        email: createdUser.email,
        role: roleInfo.role || "mechanic",
        approved: mechStatus === "approved",
        profile: roleInfo.profile,
      };
    }

    // Mock mode: create a local mechanic who is auto-approved to keep demo usable.
    const users = getLocalUsers();
    const exists = users.some((u) => u.email.toLowerCase() === email.toLowerCase());
    if (exists) throw new Error("An account with that email already exists.");
    const newUser = {
      id: uid("m"),
      email,
      password,
      role: "mechanic",
      approved: true,
      profile: { name: fullName, serviceArea: serviceArea || "" },
    };
    setLocalUsers([...users, newUser]);
    setLocalSession({ userId: newUser.id });
    return { id: newUser.id, email: newUser.email, role: newUser.role, approved: newUser.approved, profile: newUser.profile };
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
      userId: user.id,
      userEmail: user.email,
      vehicle,
      issueDescription,
      contact,
      status: "OPEN",
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
        status: "OPEN",
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

      // Mechanic approval is stored in profiles.mechanic_status.
      const roleInfo = await supaGetUserRole(supabase, user.id, user.email);
      const mechStatus = await supaGetMechanicStatus(supabase, user.id);

      // Gate 1: this portal is mechanics-only.
      const looksLikeMechanic = roleInfo.role === "mechanic" || roleInfo.role === "approved_mechanic" || Boolean(mechStatus);
      if (!looksLikeMechanic) throw new Error("This portal is for mechanics only.");

      // Gate 2: mechanic can login but cannot access portal pages until admin approval.
      return {
        id: user.id,
        email: user.email,
        role: roleInfo.role,
        approved: mechStatus === "approved",
        profile: roleInfo.profile,
      };
    }

    const users = getLocalUsers();
    const match = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!match) throw new Error("Invalid email or password.");
    if (match.role !== "mechanic" && match.role !== "approved_mechanic") throw new Error("This portal is for mechanics only.");
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
      const mechStatus = await supaGetMechanicStatus(supabase, user.id);

      // Approval gating is ALWAYS based on mechanic_status.
      return {
        id: user.id,
        email: user.email,
        role: roleInfo.role,
        approved: mechStatus === "approved",
        profile: roleInfo.profile,
      };
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
      /**
       * Request syncing:
       * - We list "open/unassigned" requests from Supabase as the mechanic's "Available" list.
       * - Different deployments may store status differently; we filter in JS using normalizeStatus()
       *   to avoid schema-specific SQL filters that can mismatch.
       */
      const { data, error } = await supabase.from("requests").select("*").is("assigned_mechanic_id", null).order("created_at", { ascending: false });
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not load requests."));
      const normalized = (data || []).map(normalizeRequestRow);
      return normalized.filter((r) => normalizeStatus(r.status) === "OPEN");
    }

    const all = getLocalRequests();
    return all.filter((r) => !r.assignedMechanicId && normalizeStatus(r.status) === "OPEN");
  },

  // PUBLIC_INTERFACE
  async listMyAssignments(mechanicId) {
    ensureSeedData();
    const supabase = getSupabase();

    // Supabase mode: prefer requests table as source of truth (more portable than assignments joins).
    if (supabase) {
      const authedUser = await requireSupabaseUser(supabase);
      const effectiveMechanicId = authedUser.id || mechanicId;
      if (!effectiveMechanicId) throw new Error("Missing mechanic id.");

      // Primary: requests assigned to this mechanic.
      const { data, error } = await supabase.from("requests").select("*").eq("assigned_mechanic_id", effectiveMechanicId).order("created_at", { ascending: false });
      if (!error && Array.isArray(data)) {
        return data.map(normalizeRequestRow);
      }

      // Fallback: if request assignment column doesn't exist in someone's schema,
      // try assignments join best-effort.
      const { data: aData, error: aErr } = await supabase
        .from("assignments")
        .select("id, mechanic_id, request_id, request:requests(*)")
        .eq("mechanic_id", effectiveMechanicId)
        .order("request_id", { ascending: false });

      if (aErr) throw new Error(friendlySupabaseErrorMessage(aErr, "Could not load assignments."));
      return (aData || [])
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
       * Acceptance + credit deduction (best-effort):
       * - Verify request is still unassigned
       * - Deduct acceptance fee (if fees/credits exist) best-effort
       * - Create assignment row best-effort (if assignments table exists)
       * - Update request row with mechanic linkage + status transition to ASSIGNED
       *
       * NOTE: Without a DB transaction/edge function, this cannot be perfectly atomic.
       * We prefer: update request first with a guard, then do optional side effects.
       * If side effects fail (missing tables), we still keep request assigned.
       */
      const mechanicId = authedUser.id;
      const mechanicEmail = authedUser.email || mechanic.email;

      // Preload existing request.
      const existing = await this.getRequestById(requestId);
      if (!existing) throw new Error("Request not found.");

      // If already assigned to someone else, stop (unless it's already assigned to this same mechanic).
      if (existing.assignedMechanicId && existing.assignedMechanicId !== mechanicId) {
        throw new Error("This request was already assigned to another mechanic.");
      }

      // 1) Update request row with a guard that it is unassigned or already assigned to this mechanic.
      // Guard is done by matching assigned_mechanic_id IS NULL OR equals mechanicId.
      // We can't do OR easily with PostgREST filters without extra complexity; do it in two steps:
      // - First attempt update where assigned_mechanic_id is null
      // - If no row updated, attempt update where assigned_mechanic_id == mechanicId (idempotent)
      const newNotes = [...(existing?.notes || []), note];

      let updatedRow = null;

      // Attempt 1: claim as unassigned
      const { data: u1, error: e1 } = await supabase
        .from("requests")
        .update({
          assigned_mechanic_id: mechanicId,
          assigned_mechanic_email: mechanicEmail,
          status: "ASSIGNED",
          notes: newNotes,
        })
        .eq("id", requestId)
        .is("assigned_mechanic_id", null)
        .select("*")
        .maybeSingle();

      if (e1) {
        throw new Error(friendlySupabaseErrorMessage(e1, "Could not accept this request."));
      }

      if (u1) {
        updatedRow = u1;
      } else {
        // Attempt 2: idempotent accept if already assigned to this mechanic
        const { data: u2, error: e2 } = await supabase
          .from("requests")
          .update({
            assigned_mechanic_email: mechanicEmail,
            status: "ASSIGNED",
            notes: newNotes,
          })
          .eq("id", requestId)
          .eq("assigned_mechanic_id", mechanicId)
          .select("*")
          .maybeSingle();

        if (e2) throw new Error(friendlySupabaseErrorMessage(e2, "Could not accept this request."));
        if (!u2) throw new Error("This request was already assigned to another mechanic.");
        updatedRow = u2;
      }

      // 2) Credits deduction best-effort
      try {
        const fee = await getAcceptanceFeeBestEffort(supabase);
        await tryDeductCreditsBestEffort({ supabase, mechanicId, amount: fee });
      } catch (creditErr) {
        // If credit deduction fails due to insufficient funds, revert assignment best-effort.
        // We do not guarantee perfect rollback without transactions.
        const msg = creditErr?.message || "";
        if (msg.includes("Insufficient credits")) {
          try {
            await supabase
              .from("requests")
              .update({
                assigned_mechanic_id: null,
                assigned_mechanic_email: null,
                status: "OPEN",
                notes: existing?.notes || [],
              })
              .eq("id", requestId)
              .eq("assigned_mechanic_id", mechanicId);
          } catch {
            // ignore rollback failure
          }
          throw creditErr;
        }
        // Otherwise ignore (table missing / RLS / etc.)
      }

      // 3) Ensure an assignment row exists (best-effort; ignore if table missing).
      try {
        const { data: existingAssignment } = await supabase.from("assignments").select("id").eq("request_id", requestId).eq("mechanic_id", mechanicId).maybeSingle();
        if (!existingAssignment?.id) {
          await supabase.from("assignments").insert({ mechanic_id: mechanicId, request_id: requestId });
        }
      } catch {
        // ignore (schema might not have assignments)
      }

      return updatedRow ? normalizeRequestRow(updatedRow) : true;
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
      notes: [...(r.notes || []), note],
    };
    setLocalRequests(all);
    return all[idx];
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
      const { error } = await supabase.from("requests").update({ status: canonical, notes: [...(existing?.notes || []), note] }).eq("id", requestId);
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not update status."));
      return true;
    }

    const all = getLocalRequests();
    const idx = all.findIndex((r) => r.id === requestId);
    if (idx < 0) throw new Error("Request not found.");
    all[idx] = { ...all[idx], status: canonical, notes: [...(all[idx].notes || []), note] };
    setLocalRequests(all);
    return true;
  },

  // PUBLIC_INTERFACE
  async updateProfile({ userId, profile }) {
    ensureSeedData();
    const supabase = getSupabase();
    if (supabase) {
      /**
       * IMPORTANT (mechanic portal security/business rule):
       * Any profile update initiated from the mechanic portal must keep the account:
       * - role='mechanic'
       * - mechanic_status='pending'
       *
       * This prevents accidental/malicious drift of role/status through "update profile" flows,
       * and ensures approvals remain admin-only.
       */
      const { error } = await supabase
        .from("profiles")
        .update({
          profile,
          role: "mechanic",
          mechanic_status: "pending",
        })
        .eq("id", userId);

      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Could not save profile."));
      return true;
    }

    const users = getLocalUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx < 0) throw new Error("User not found.");

    // Mock mode: keep the mechanic identity consistent as well.
    users[idx] = { ...users[idx], role: "mechanic", approved: users[idx].approved === true, profile };
    setLocalUsers(users);
    return true;
  },

  // PUBLIC_INTERFACE
  isSupabaseConfigured,
};
