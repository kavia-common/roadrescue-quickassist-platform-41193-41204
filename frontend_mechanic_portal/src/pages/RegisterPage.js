import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { dataService } from "../services/dataService";

function registrationGuidance() {
  return [
    "If email confirmation is enabled in Supabase, you may need to verify your email before a session is established.",
    "If this environment is misconfigured, confirm REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_KEY are set.",
    "After verifying email, return to Login and sign in, then retry registration if needed.",
  ];
}

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
  const [banner, setBanner] = useState({ type: "", title: "", message: "", items: [] });
  const [done, setDone] = useState(false);

  const passwordHint = useMemo(() => "At least 6 characters.", []);

  const setErrorBanner = (title, message, items = []) =>
    setBanner({
      type: "error",
      title,
      message,
      items,
    });

  const submit = async (e) => {
    e.preventDefault();
    setBanner({ type: "", title: "", message: "", items: [] });

    if (!supa) {
      setErrorBanner(
        "Supabase not configured",
        "Registration requires Supabase to be configured for this environment.",
        ["Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_KEY, then reload the app."]
      );
      return;
    }

    if (!name.trim()) return setErrorBanner("Missing name", "Name is required.");
    if (!email.trim()) return setErrorBanner("Missing email", "Email is required.");
    if (password.length < 6) return setErrorBanner("Invalid password", "Password must be at least 6 characters.");

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

      // Keep pending gating.
      navigate("/pending");
    } catch (e2) {
      const msg = e2?.message || "Could not register.";

      // Required: if session missing, show explicit required text + guidance.
      const sessionMissing = msg.toLowerCase().includes("session not established") || msg.toLowerCase().includes("no session");
      if (sessionMissing) {
        setErrorBanner(
          "Registration needs email verification or login",
          "Authentication session not established. Please check your email for verification (if enabled) or try logging in, then retry registration.",
          registrationGuidance()
        );
      } else {
        setErrorBanner("Could not create account", msg, registrationGuidance());
      }
    } finally {
      setBusy(false);
    }
  };

  const Banner = banner.type ? (
    <div className={banner.type === "error" ? "alert alert-error" : "alert alert-info"} style={{ marginBottom: 12 }}>
      {banner.title ? <div style={{ fontWeight: 900, marginBottom: 4 }}>{banner.title}</div> : null}
      <div>{banner.message}</div>
      {banner.items?.length ? (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {banner.items.map((x) => (
            <li key={x} style={{ margin: "4px 0" }}>
              {x}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null;

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
          <div className="alert alert-info" style={{ marginBottom: 12 }}>
            Supabase is not configured here. To enable registration, set <code>REACT_APP_SUPABASE_URL</code> and <code>REACT_APP_SUPABASE_KEY</code>.
          </div>
        ) : null}

        {done ? <div className="alert">Account created. Redirecting…</div> : null}
        {Banner}

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
            <span className="hint">By registering, you agree that your account details may be reviewed by administrators for approval.</span>
          </div>

          {supa ? (
            <div className="hint" style={{ marginTop: 6 }}>
              Note: If email confirmation is enabled, you may need to verify your email before your account can be fully activated.
            </div>
          ) : null}
        </form>
      </Card>
    </div>
  );
}
