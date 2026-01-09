import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { dataService } from "../services/dataService";

function guidanceItems({ supa }) {
  const items = [];
  if (!supa) {
    items.push("Supabase is not configured in this environment (mock mode is active).");
    items.push("To enable real login, set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_KEY.");
  } else {
    items.push("If you recently registered and email confirmation is enabled, verify your email before logging in.");
    items.push("If login succeeds but you see a 'no session' message, re-check Supabase URL configuration and site domain allowlist.");
  }
  return items;
}

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

  const [banner, setBanner] = useState({ type: "", title: "", message: "", items: [] });
  const [busy, setBusy] = useState(false);

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

    if (!email.trim()) return setErrorBanner("Missing email", "Email is required.");
    if (password.length < 6) return setErrorBanner("Invalid password", "Password must be at least 6 characters.");

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
      const msg = err?.message || "Login failed.";
      const extra =
        msg.toLowerCase().includes("supabase") || msg.toLowerCase().includes("session") || msg.toLowerCase().includes("network")
          ? guidanceItems({ supa })
          : [];
      setErrorBanner("Could not sign in", msg, extra);
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
        {Banner}

        <form className="form" onSubmit={submit}>
          <Input label="Email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} />
          <Input
            label="Password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={busy}
          />

          <div className="row">
            <Button type="submit" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </Button>
            <Link className="link" to="/register">
              Need an account? Register →
            </Link>
          </div>

          {supa ? (
            <div className="hint" style={{ marginTop: 6 }}>
              Tip: If email confirmation is enabled, you must verify your email before you can fully sign in.
            </div>
          ) : (
            <div className="hint" style={{ marginTop: 6 }}>
              Mock mode is active. To enable Supabase auth, configure <code>REACT_APP_SUPABASE_URL</code> and <code>REACT_APP_SUPABASE_KEY</code>.
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
