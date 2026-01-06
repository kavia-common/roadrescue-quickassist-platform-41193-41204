import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { dataService } from "../services/dataService";

// PUBLIC_INTERFACE
export function RequestDetailPage({ user }) {
  /** Mechanic request detail & status controls. */
  const { requestId } = useParams();
  const [req, setReq] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allowedStatuses = useMemo(() => ["Accepted", "En Route", "Working", "Completed"], []);

  const load = async () => {
    setError("");
    try {
      const r = await dataService.getRequestById(requestId);
      if (!r) throw new Error("Request not found.");
      setReq(r);
    } catch (e) {
      setError(e.message || "Could not load request.");
    }
  };

  useEffect(() => {
    load();
  }, [requestId]);

  const setStatus = async (status) => {
    setBusy(true);
    setError("");
    try {
      if (!req.assignedMechanicId) {
        await dataService.acceptRequest({ requestId: req.id, mechanic: user });
      }
      await dataService.updateRequestStatus({ requestId: req.id, status, mechanic: user, noteText: note.trim() || undefined });
      setNote("");
      await load();
    } catch (e) {
      setError(e.message || "Could not update status.");
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="container">
        <Card title="Request detail">
          <div className="alert alert-error">{error}</div>
          <Link className="link" to="/dashboard">← Back</Link>
        </Card>
      </div>
    );
  }
  if (!req) return <div className="container"><div className="skeleton">Loading…</div></div>;

  return (
    <div className="container">
      <div className="hero">
        <h1 className="h1">Request {req.id.slice(0, 8)}</h1>
        <p className="lead">Current status: <strong>{req.status}</strong></p>
      </div>

      <div className="grid2">
        <Card title="Customer & contact">
          <div className="kv">
            <div>
              <span className="k">Customer</span>
              <span className="v">{req.userEmail || "—"}</span>
            </div>
            <div>
              <span className="k">Contact</span>
              <span className="v">{req.contact?.name || "—"}</span>
            </div>
            <div>
              <span className="k">Phone</span>
              <span className="v">{req.contact?.phone || "—"}</span>
            </div>
            <div>
              <span className="k">Email</span>
              <span className="v">{req.contact?.email || "—"}</span>
            </div>
          </div>
        </Card>

        <Card title="Vehicle">
          <div className="kv">
            <div>
              <span className="k">Make</span>
              <span className="v">{req.vehicle?.make || "—"}</span>
            </div>
            <div>
              <span className="k">Model</span>
              <span className="v">{req.vehicle?.model || "—"}</span>
            </div>
            <div>
              <span className="k">Year</span>
              <span className="v">{req.vehicle?.year || "—"}</span>
            </div>
            {/* Plate only shown in request detail, stay canonical */}
            <div>
              <span className="k">Plate</span>
              <span className="v">{req.vehicle?.plate || "—"}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Issue">
        <p style={{ marginTop: 0 }}>{req.issueDescription}</p>
        <div className="divider" />
        <div className="field">
          <label className="label" htmlFor="note">Progress note (optional)</label>
          <textarea id="note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g., On the way, ETA 15 minutes." />
        </div>
        <div className="row">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {allowedStatuses.map((s) => (
              <Button key={s} variant={s === "Completed" ? "secondary" : "primary"} onClick={() => setStatus(s)} disabled={busy}>
                Set: {s}
              </Button>
            ))}
          </div>
          <Link className="link" to="/assignments">← Back to assignments</Link>
        </div>

        {req.notes?.length ? (
          <>
            <div className="divider" />
            <div>
              <div className="label">History</div>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--text)" }}>
                {req.notes.slice().reverse().map((n) => (
                  <li key={n.id} style={{ margin: "8px 0" }}>
                    <span style={{ color: "var(--muted)", fontWeight: 800 }}>{new Date(n.at).toLocaleString()} • {n.by}:</span>{" "}
                    <span style={{ fontWeight: 700 }}>{n.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
