import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { dataService } from "../services/dataService";

// PUBLIC_INTERFACE
export function LoginPage({ onAuthed }) {
  /** Mechanic login page. */
  const navigate = useNavigate();
  const supa = dataService.isSupabaseConfigured?.();

  const defaults = useMemo(() => {
    // In Supabase mode, do not prefill demo credentials.
    if (supa) return { email: "", password: "" };
    return { email: "mech@example.com", password: "password123" };
  }, [supa]);

  const [email, setEmail] = useState(defaults.email);
  const [password, setPassword] = useState(defaults.password);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) return setError("Email is required.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setBusy(true);
    try {
      const u = await dataService.login(email.trim(), password);

      // Only mechanics can use this portal. (Admin/users should use other portals.)
      if (u.role !== "mechanic" && u.role !== "approved_mechanic") {
        throw new Error("This portal is for mechanics only.");
      }

      onAuthed?.(u);

      // IMPORTANT: pending mechanics must not access dashboard.
      if (!u.approved && u.status !== "approved") {
        navigate("/pending");
      } else {
        navigate("/dashboard");
      }
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

      <Card
        title="Login"
        subtitle={supa ? "Sign in with your mechanic account." : "Use demo mechanic: mech@example.com / password123"}
        actions={
          <Link className="link" to="/register">
            Register
          </Link>
        }
      >
        <form className="form" onSubmit={submit}>
          <Input label="Email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input
            label="Password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error ? <div className="alert alert-error">{error}</div> : null}
          <div className="row">
            <Button type="submit" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </Button>
            <Link className="link" to="/register">
              Need an account? Register →
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
