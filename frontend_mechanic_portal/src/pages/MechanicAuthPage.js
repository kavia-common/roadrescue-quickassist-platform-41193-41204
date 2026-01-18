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

// PUBLIC_INTERFACE
export function MechanicAuthPage() {
  /** Mechanic auth page: Login + Registration that creates a pending mechanic application (Supabase mode). */
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = useState(initialMode);

  const { user, mechanicStatus, loading: authLoading, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  // Login form
  const [loginEmail, setLoginEmail] = useState("mech@example.com");
  const [loginPassword, setLoginPassword] = useState("password123");
  const [showLoginPw, setShowLoginPw] = useState(false);

  // Register form
  const [fullName, setFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showRegPw, setShowRegPw] = useState(false);
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

  const onLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!loginEmail.trim()) return setError("Email is required.");
    if (loginPassword.length < 6) return setError("Password must be at least 6 characters.");

    setBusy(true);
    try {
      const { user: u, error: err } = await signIn(loginEmail.trim(), loginPassword);
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
        {error ? <div className="alert alert-error">{error}</div> : null}

        {mode === "login" ? (
          <form className="form" onSubmit={onLogin}>
            <Input label="Email" name="loginEmail" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
            <div style={{ position: "relative" }}>
              <Input
                label="Password"
                name="loginPassword"
                type={showLoginPw ? "text" : "password"}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
              <button
                type="button"
                aria-label={showLoginPw ? "Hide password" : "Show password"}
                className="btn btn-ghost"
                style={{
                  position: "absolute",
                  top: 28,
                  right: 10,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontSize: 20,
                  opacity: 0.73,
                  zIndex: 2
                }}
                tabIndex={0}
                onClick={() => setShowLoginPw((v) => !v)}
              >
                {showLoginPw ? (
                  // Eye-off SVG
                  <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 22 22"><path d="M1 1l20 20M17.8 17.8C15.2 19.2 13.4 19.9 11 19.9c-6 0-9-6-9-6 .93-1.75 2.07-3.2 3.47-4.38M9.3 9.3a2 2 0 0 1 3.4 2.34"/></svg>
                ) : (
                  // Eye SVG
                  <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 22 22"><circle cx="11" cy="11" r="3.5"/><path d="M1 11S5 4 11 4s10 7 10 7-4 7-10 7S1 11 1 11z"/></svg>
                )}
              </button>
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
            <div style={{ position: "relative" }}>
              <Input
                label="Password"
                name="regPassword"
                type={showRegPw ? "text" : "password"}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                required
                hint="Minimum 6 characters"
              />
              <button
                type="button"
                aria-label={showRegPw ? "Hide password" : "Show password"}
                className="btn btn-ghost"
                style={{
                  position: "absolute",
                  top: 28,
                  right: 10,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontSize: 20,
                  opacity: 0.73,
                  zIndex: 2
                }}
                tabIndex={0}
                onClick={() => setShowRegPw((v) => !v)}
              >
                {showRegPw ? (
                  // Eye-off SVG
                  <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 22 22"><path d="M1 1l20 20M17.8 17.8C15.2 19.2 13.4 19.9 11 19.9c-6 0-9-6-9-6 .93-1.75 2.07-3.2 3.47-4.38M9.3 9.3a2 2 0 0 1 3.4 2.34"/></svg>
                ) : (
                  // Eye SVG
                  <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 22 22"><circle cx="11" cy="11" r="3.5"/><path d="M1 11S5 4 11 4s10 7 10 7-4 7-10 7S1 11 1 11z"/></svg>
                )}
              </button>
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
