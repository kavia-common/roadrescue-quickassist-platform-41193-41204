import React, { useState } from "react";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { dataService } from "../services/dataService";

// PUBLIC_INTERFACE
export function ProfilePage({ user, onUserUpdated }) {
  /** Mechanic profile editor (display name, service area). */
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [serviceArea, setServiceArea] = useState(user.serviceArea || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const save = async (e) => {
    e.preventDefault();
    setMsg("");
    setError("");
    if (!displayName.trim()) return setError("Display name is required.");
    setBusy(true);
    try {
      const updates = { displayName: displayName.trim(), serviceArea: serviceArea.trim() };
      await dataService.updateProfile({ userId: user.id, ...updates });
      onUserUpdated?.({ ...user, ...updates });
      setMsg("Profile saved.");
    } catch (e2) {
      setError(e2.message || "Could not save profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <div className="hero">
        <h1 className="h1">Profile</h1>
        <p className="lead">Keep your service area up to date for dispatching and assignments.</p>
      </div>

      <Card title="Mechanic details" subtitle="Stored in Supabase profiles when configured; otherwise local demo storage.">
        <form className="form" onSubmit={save}>
          <Input
            label="Display name"
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          <Input
            label="Service area"
            name="serviceArea"
            value={serviceArea}
            onChange={(e) => setServiceArea(e.target.value)}
            placeholder="e.g., Downtown, Northside"
          />
          {msg ? <div className="alert">{msg}</div> : null}
          {error ? <div className="alert alert-error">{error}</div> : null}
          <div className="row">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
