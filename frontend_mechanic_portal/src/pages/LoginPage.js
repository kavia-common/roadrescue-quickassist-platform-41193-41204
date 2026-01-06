import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { dataService } from "../services/dataService";

// PUBLIC_INTERFACE
export function LoginPage({ onAuthed }) {
  /** Mechanic login page. */
  const navigate = useNavigate();
  const [email, setEmail] = useState("mech@example.com");
  const [password, setPassword] = useState("password123");
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
      if (u.role !== "mechanic" && u.role !== "approved_mechanic") {
        throw new Error("This portal is for mechanics only.");
      }
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

      <Card title="Login" subtitle="Use demo mechanic: mech@example.com / password123">
        <form className="form" onSubmit={submit}>
          <Input label="Email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
