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
     * 2) Call Edge Function mechanic-signup-upsert (best-effort; warn-only if it fails)
     * 3) Ensure/update profiles row to set:
     *    - role='mechanic'
     *    - mechanic_status='pending'
     *    - phone/service_area/specialization
     * 4) (Optional/best-effort) insert user_roles row with role='mechanic'
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

      /**
       * Best-effort: notify the mechanic-signup-upsert Edge Function.
       *
       * IMPORTANT:
       * - Do NOT block account creation if this fails.
       * - URL is literal per user instructions for this step.
       * - We send form-derived values from this scope:
       *   phone, serviceArea, specialization, fullName (as display_name).
       */
      try {
        await fetch("https://smpmldmpizlfvfduoftj.supabase.co/functions/v1/mechanic-signup-upsert", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: createdUser.id,
            email: createdUser.email,
            phone: phone || "",
            service_area: serviceArea || "",
            specialization: Array.isArray(specialization) ? specialization : [],
            display_name: fullName || "",
          }),
        });
      } catch (edgeErr) {
        // eslint-disable-next-line no-console
        console.warn("mechanic-signup-upsert edge function failed (non-blocking):", edgeErr);
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

    // Normalize inputs to avoid false negatives (e.g., trailing spaces or case differences).
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) throw new Error(friendlySupabaseErrorMessage(error, "Login failed."));
      const user = data.user;

      // Mechanic approval is stored in profiles.mechanic_status.
      const roleInfo = await supaGetUserRole(supabase, user.id, user.email);
      const mechStatus = await supaGetMechanicStatus(supabase, user.id);

      // Gate 1: this portal is mechanics-only.
      const looksLikeMechanic = roleInfo.role === "mechanic" || roleInfo.role === "approved_mechanic" || Boolean(mechStatus);
      if (!looksLikeMechanic) throw new Error("This portal is for mechanics only.");

      // Gate 2 (per user request): mechanic can login but cannot access portal pages until admin approval.
      // We still return the user object so UI can route to /pending and show status,
      // but `RequireAuth` blocks dashboard access unless mechanicStatus === 'approved'.
      return {
        id: user.id,
        email: user.email,
        role: roleInfo.role,
        approved: mechStatus === "approved",
        profile: roleInfo.profile,
      };
    }

    // Mock mode: only seeded/demo users exist. If a real mechanic tries to log in here, the UX should
    // explain that Supabase env vars are likely missing.
    const users = getLocalUsers();
    const match = users.find((u) => String(u.email || "").trim().toLowerCase() === normalizedEmail && u.password === password);

    if (!match) {
      throw new Error(
        "Invalid email or password. If you are trying to sign in with a real mechanic account, Supabase is likely not configured for this portal (missing REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_KEY)."
      );
    }
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

      // Approval gating is ALWAYS based on mechanic_status (per schema doc / user_input_ref).
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
       * Accept flow (Supabase mode):
       * - MUST assign the request to the currently authenticated mechanic (auth.uid()).
       * - MUST set requests.status = 'ASSIGNED' (canonical).
       * - `assignments` table is OPTIONAL: some deployments don't have it, or RLS blocks it.
       *   Therefore: request row update is the authoritative write; assignments is best-effort.
       */
      const mechanicId = authedUser.id;
      const mechanicEmail = authedUser.email || mechanic.email;

      // Preload existing request for note append and conflict checks.
      const existing = await this.getRequestById(requestId);
      if (!existing) throw new Error("Request not found.");

      // If already assigned to someone else, stop (unless it's already assigned to this same mechanic).
      if (existing.assignedMechanicId && existing.assignedMechanicId !== mechanicId) {
        throw new Error("This request was already assigned to another mechanic.");
      }

      // 1) Update request row (authoritative). Guard against race: only assign if still unassigned OR already mine.
      const { data: updated, error: reqErr } = await supabase
        .from("requests")
        .update({
          assigned_mechanic_id: mechanicId,
          assigned_mechanic_email: mechanicEmail,
          status: "ASSIGNED",
          notes: [...(existing?.notes || []), note],
        })
        .eq("id", requestId)
        // Only allow assignment if unassigned or already assigned to this mechanic
        .or(`assigned_mechanic_id.is.null,assigned_mechanic_id.eq.${mechanicId}`)
        .select("*")
        .maybeSingle();

      if (reqErr) {
        throw new Error(
          friendlySupabaseErrorMessage(
            reqErr,
            "Could not accept this request. If this is a permissions issue, ensure your mechanic account is approved and Supabase RLS policies allow assigning requests."
          )
        );
      }
      if (!updated) {
        // When RLS blocks returning rows or another mechanic won the race, Supabase may return null.
        throw new Error("Could not accept this request. It may have been assigned to another mechanic.");
      }

      // 2) Best-effort: ensure an assignments row exists (non-blocking if table missing or RLS blocks it)
      try {
        const { data: existingAssignment } = await supabase
          .from("assignments")
          .select("id")
          .eq("request_id", requestId)
          .eq("mechanic_id", mechanicId)
          .maybeSingle();

        if (!existingAssignment?.id) {
          await supabase.from("assignments").insert({
            mechanic_id: mechanicId,
            request_id: requestId,
          });
        }
      } catch {
        // Non-blocking: deployments may not have assignments or may restrict inserts via RLS.
      }

      // Return updated request for immediate UI feedback
      return normalizeRequestRow(updated);
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
    all[idx] = { ...all[idx], status: canonical, notes: [...(all[idx].notes || []), note] };
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
