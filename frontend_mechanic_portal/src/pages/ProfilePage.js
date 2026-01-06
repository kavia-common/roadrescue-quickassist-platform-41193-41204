import React, { useState } from "react";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { dataService } from "../services/dataService";

// PUBLIC_INTERFACE
export function ProfilePage({ user, onUserUpdated }) {
  /** Mechanic profile editor (name, service area). */
  const [name, setName] = useState(user.profile?.name || "");
  const [serviceArea, setServiceArea] = useState(user.profile?.serviceArea || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const save = async (e) => {
    e.preventDefault();
    setMsg("");
    setError("");
    if (!name.trim()) return setError("Name is required.");
    setBusy(true);
    try {
      const profile = { name: name.trim(), serviceArea: serviceArea.trim() };
      await dataService.updateProfile({ userId: user.id, profile });
      onUserUpdated?.({ ...user, profile });
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
          <Input label="Display name" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Service area" name="serviceArea" value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} placeholder="e.g., Downtown, Northside" />
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
