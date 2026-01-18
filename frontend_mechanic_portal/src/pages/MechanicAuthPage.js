import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";

const SPECIALIZATIONS = [
  "Engine Repair",
  "Tire Service",
  "Battery Service",
  "Electrical Systems",
  "Brake Repair",
  "Transmission",
  "General Maintenance",
  "Towing",
];

function EyeIcon({ open = false, size = 18 }) {
  // Inline SVGs to avoid adding dependencies.
  // "open" = password visible.
  if (open) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path
          d="M1.5 12s3.75-7.5 10.5-7.5S22.5 12 22.5 12 18.75 19.5 12 19.5 1.5 12 1.5 12Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M12 15.75A3.75 3.75 0 1 0 12 8.25a3.75 3.75 0 0 0 0 7.5Z"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    );
  }

  // Eye with slash (hidden)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M10.6 10.6A2.5 2.5 0 0 0 13.4 13.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9.2 5.4A10.7 10.7 0 0 1 12 4.5c6.75 0 10.5 7.5 10.5 7.5a18.7 18.7 0 0 1-3.3 4.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M6.1 6.1C3.2 8.4 1.5 12 1.5 12s3.75 7.5 10.5 7.5c1.2 0 2.3-.2 3.3-.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 8.25c2.07 0 3.75 1.68 3.75 3.75"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// PUBLIC_INTERFACE
export function MechanicAuthPage() {
  /** Mechanic auth page: Login + Registration that creates a pending mechanic application (Supabase mode). */
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = useState(initialMode);

  const { user, mechanicStatus, loading: authLoading, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  // Local state for show/hide password (login + register kept separate to avoid surprises)
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Login form
  const [loginEmail, setLoginEmail] = useState("mech@example.com");
  const [loginPassword, setLoginPassword] = useState("password123");

  // Register form
  const [fullName, setFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [specialization, setSpecialization] = useState([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canRegister = useMemo(() => {
    if (!fullName.trim()) return false;
    if (!regEmail.trim()) return false;
    if (regPassword.length < 6) return false;
    return true;
  }, [fullName, regEmail, regPassword]);

  // If already authed, route based on status (per user_input_ref).
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    if (mechanicStatus === "approved") {
      navigate("/dashboard", { replace: true });
    } else if (mechanicStatus === "pending" || mechanicStatus === "rejected" || mechanicStatus === "suspended") {
      navigate("/pending", { replace: true });
    } else {
      // If no mechanic record found, keep user here (they can register) or send to pending as a safe default.
      // We keep them here so they can submit an application.
    }
  }, [authLoading, user, mechanicStatus, navigate]);

  const isValidEmail = (value) => {
    // Conservative, practical email check (accepts modern TLDs and '+' tags).
    const v = String(value || "").trim();
    if (!v) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  };

  const onLogin = async (e) => {
    e.preventDefault();
    setError("");

    const email = loginEmail.trim();
    if (!email) return setError("Email is required.");
    if (!isValidEmail(email)) return setError("Please enter a valid email address (e.g., shanmuga@kavia.ai).");
    if (loginPassword.length < 6) return setError("Password must be at least 6 characters.");

    setBusy(true);
    try {
      const { user: u, error: err } = await signIn(email, loginPassword);
      if (err) throw err;

      // Redirect will happen via effect once mechanicStatus is loaded,
      // but we add a small deterministic fallback:
      if (u) {
        // no-op; effect handles routing.
      }
    } catch (e2) {
      setError(e2?.message || "Login failed.");
    } finally {
      setBusy(false);
    }
  };

  const onRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (!canRegister) {
      setError("Please fill required fields (name, email) and use a password of at least 6 characters.");
      return;
    }

    setBusy(true);
    try {
      const { error: err } = await signUp({
        fullName: fullName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        phone: phone.trim(),
        serviceArea: serviceArea.trim(),
        specialization,
      });
      if (err) throw err;

      // Per spec: after successful registration, redirect to pending.
      navigate("/pending", { replace: true });
    } catch (e2) {
      setError(e2?.message || "Registration failed.");
    } finally {
      setBusy(false);
    }
  };

  const toggleSpecialization = (label) => {
    setSpecialization((prev) => {
      if (prev.includes(label)) return prev.filter((x) => x !== label);
      return [...prev, label];
    });
  };

  const passwordToggleBaseStyle = {
    position: "absolute",
    right: 8,
    top: "50%",
    transform: "translateY(-50%)",
    width: 36,
    height: 36,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    color: "var(--muted)",
    background: "transparent",
    border: "1px solid transparent",
    cursor: "pointer",
    // No layout shift: button is absolutely positioned within a fixed-height input wrapper.
  };

  const passwordToggleFocusStyle = {
    borderColor: "rgba(37,99,235,0.45)",
    boxShadow: "0 0 0 4px rgba(37,99,235,0.12)",
    color: "var(--text)",
  };

  return (
    <div className="container">
      <div className="hero">
        <h1 className="h1">Mechanic Portal</h1>
        <p className="lead">Register as a mechanic and wait for admin approval, then manage assignments.</p>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-body" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button variant={mode === "login" ? "primary" : "ghost"} onClick={() => setMode("login")}>
            Login
          </Button>
          <Button variant={mode === "register" ? "primary" : "ghost"} onClick={() => setMode("register")}>
            Register
          </Button>
        </div>
      </div>

      <Card
        title={mode === "login" ? "Login" : "Mechanic registration"}
        subtitle={
          mode === "login"
            ? "Use demo mechanic (mock mode): mech@example.com / password123"
            : "Create your account and submit an application (status: pending) for admin approval."
        }
      >
        {process.env.REACT_APP_SUPABASE_URL && process.env.REACT_APP_SUPABASE_KEY ? (
          <div className="alert alert-info" style={{ marginBottom: 12 }}>
            Auth mode: <strong>Supabase</strong>
          </div>
        ) : (
          <div className="alert alert-info" style={{ marginBottom: 12 }}>
            Auth mode: <strong>Mock</strong>. Real accounts (e.g. shanmuga@kavia.ai) will not work until{" "}
            <code>REACT_APP_SUPABASE_URL</code> and <code>REACT_APP_SUPABASE_KEY</code> are configured.
          </div>
        )}

        {error ? <div className="alert alert-error">{error}</div> : null}

        {mode === "login" ? (
          <form className="form" onSubmit={onLogin}>
            <Input label="Email" name="loginEmail" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />

            <div className="field">
              <label className="label" htmlFor="loginPassword">
                Password <span className="req">*</span>
              </label>

              <div style={{ position: "relative" }}>
                <input
                  id="loginPassword"
                  name="loginPassword"
                  className="input"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  type={showLoginPassword ? "text" : "password"}
                  // keep same feel as Input; pad right so icon doesn't overlap text
                  style={{ paddingRight: 46 }}
                  required
                />

                <button
                  type="button"
                  role="button"
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowLoginPassword((v) => !v)}
                  onKeyDown={(e) => {
                    // Keyboard operability: Enter/Space toggles
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setShowLoginPassword((v) => !v);
                    }
                  }}
                  style={passwordToggleBaseStyle}
                  onFocus={(e) => {
                    Object.assign(e.currentTarget.style, passwordToggleFocusStyle);
                  }}
                  onBlur={(e) => {
                    Object.assign(e.currentTarget.style, passwordToggleBaseStyle);
                  }}
                >
                  <EyeIcon open={showLoginPassword} />
                </button>
              </div>
            </div>

            <div className="row">
              <Button type="submit" disabled={busy}>
                {busy ? "Signing in..." : "Sign in"}
              </Button>
              <Button variant="ghost" type="button" disabled={busy} onClick={() => setMode("register")}>
                Need an account? Register →
              </Button>
            </div>
          </form>
        ) : (
          <form className="form" onSubmit={onRegister}>
            <Input label="Full name" name="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <Input label="Email" name="regEmail" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required />
            <Input label="Phone" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />

            <div className="field">
              <label className="label" htmlFor="regPassword">
                Password <span className="req">*</span>
              </label>

              <div style={{ position: "relative" }}>
                <input
                  id="regPassword"
                  name="regPassword"
                  className="input"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  type={showRegPassword ? "text" : "password"}
                  style={{ paddingRight: 46 }}
                  required
                />

                <button
                  type="button"
                  role="button"
                  aria-label={showRegPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowRegPassword((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setShowRegPassword((v) => !v);
                    }
                  }}
                  style={passwordToggleBaseStyle}
                  onFocus={(e) => {
                    Object.assign(e.currentTarget.style, passwordToggleFocusStyle);
                  }}
                  onBlur={(e) => {
                    Object.assign(e.currentTarget.style, passwordToggleBaseStyle);
                  }}
                >
                  <EyeIcon open={showRegPassword} />
                </button>
              </div>

              <div className="hint">Minimum 6 characters</div>
            </div>

            <Input label="Service area" name="serviceArea" value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} placeholder="Optional" />

            <div className="field">
              <div className="label">Specializations (optional)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {SPECIALIZATIONS.map((s) => {
                  const checked = specialization.includes(s);
                  return (
                    <label
                      key={s}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        border: "1px solid var(--border)",
                        borderRadius: 999,
                        padding: "8px 10px",
                        background: checked ? "rgba(37,99,235,0.08)" : "#fff",
                        fontSize: 13,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleSpecialization(s)} />
                      {s}
                    </label>
                  );
                })}
              </div>
              <div className="hint">These help admins verify your profile; you can update later.</div>
            </div>

            <div className="row">
              <Button type="submit" disabled={busy || !canRegister}>
                {busy ? "Submitting..." : "Submit application"}
              </Button>
              <Button variant="ghost" type="button" disabled={busy} onClick={() => setMode("login")}>
                Already registered? Login →
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
