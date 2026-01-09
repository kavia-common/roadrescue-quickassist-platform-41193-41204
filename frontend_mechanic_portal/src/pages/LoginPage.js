import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { dataService } from "../services/dataService";

// PUBLIC_INTERFACE
export function LoginPage({ onAuthed }) {
  /** Mechanic login page (gated by admin approval). */
  const navigate = useNavigate();
  const [email, setEmail] = useState("mech@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");

  // Live refresh: if an admin approves this mechanic while they're on the login screen,
  // re-check the session/profile and allow them to proceed without a full reload.
  useEffect(() => {
    const unsubscribe = dataService.subscribeToProfilesChanged(async () => {
      setInfo("");
      setError("");

      try {
        const u = await dataService.getCurrentUser();
        if (u?.approved && (u.role === "mechanic" || u.role === "approved_mechanic")) {
          onAuthed?.(u);
          navigate("/dashboard");
        } else {
          // Only show a gentle hint; do not spam errors while user is typing.
          setInfo("If you were just approved by an admin, you can sign in now.");
        }
      } catch {
        // ignore
      }
    });

    return unsubscribe;
  }, [navigate, onAuthed]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!email.trim()) return setError("Email is required.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setBusy(true);
    try {
      const u = await dataService.login(email.trim(), password);

      // dataService.login enforces canonical gate:
      // role in ["mechanic","approved_mechanic"] AND approved===true.
      onAuthed?.(u);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <div className="hero">
        <h1 className="h1">Mechanic Portal</h1>
        <p className="lead">Accept new requests and update statuses through completion.</p>
      </div>

      <Card title="Login" subtitle="Mechanic accounts require admin approval before access is granted.">
        <form className="form" onSubmit={submit}>
          <Input label="Email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

          {info ? <div className="alert alert-info">{info}</div> : null}
          {error ? <div className="alert alert-error">{error}</div> : null}

          <div className="row">
            <Button type="submit" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
