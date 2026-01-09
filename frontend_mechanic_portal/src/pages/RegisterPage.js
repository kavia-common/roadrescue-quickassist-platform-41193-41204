import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { dataService } from "../services/dataService";

// PUBLIC_INTERFACE
export function RegisterPage({ onAuthed }) {
  /** Mechanic registration: creates Supabase Auth user + a pending mechanic profile row. */
  const navigate = useNavigate();
  const supa = dataService.isSupabaseConfigured?.();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const passwordHint = useMemo(() => "At least 6 characters.", []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!supa) {
      setError("Registration requires Supabase to be configured for this environment.");
      return;
    }

    if (!name.trim()) return setError("Name is required.");
    if (!email.trim()) return setError("Email is required.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");

    setBusy(true);
    try {
      const u = await dataService.registerMechanic({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || null,
        serviceType: serviceType.trim() || null,
      });

      // Newly registered mechanics are pending by default.
      onAuthed?.(u);
      setDone(true);
      navigate("/pending");
    } catch (e2) {
      setError(e2?.message || "Could not register.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <div className="hero">
        <h1 className="h1">Register as a mechanic</h1>
        <p className="lead">Create your account. An admin will review and approve your access.</p>
      </div>

      <Card
        title="Registration"
        subtitle="Your account will start in Pending status until an admin approves it."
        actions={
          <Link className="link" to="/login">
            Back to login
          </Link>
        }
      >
        {!supa ? (
          <div className="alert alert-info">
            Supabase is not configured here. To enable registration, set <code>REACT_APP_SUPABASE_URL</code> and{" "}
            <code>REACT_APP_SUPABASE_KEY</code>.
          </div>
        ) : null}

        {done ? <div className="alert">Account created. Redirecting…</div> : null}
        {error ? <div className="alert alert-error">{error}</div> : null}

        <form className="form" onSubmit={submit}>
          <Input label="Name" name="name" value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} />
          <Input label="Phone" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
          <Input
            label="Service type (optional)"
            name="serviceType"
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            placeholder="e.g., Towing, Battery, Tire"
            disabled={busy}
          />
          <Input label="Email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} />
          <Input
            label="Password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            hint={passwordHint}
            disabled={busy}
          />

          <div className="row">
            <Button type="submit" disabled={busy || !supa}>
              {busy ? "Creating..." : "Create account"}
            </Button>
            <span className="hint">
              By registering, you agree that your account details may be reviewed by administrators for approval.
            </span>
          </div>
        </form>
      </Card>
    </div>
  );
}
