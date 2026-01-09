import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { MapView } from "../components/MapView";
import { dataService } from "../services/dataService";
import { statusLabel } from "../services/statusUtils";

function extractLatLng(req) {
  // Future-proofing: if the request ever includes location fields, support common shapes.
  // Current repo schema may not provide this yet, so this will usually be null.
  const loc = req?.location;
  if (loc && typeof loc === "object" && typeof loc.lat === "number" && typeof loc.lng === "number") {
    return { lat: loc.lat, lng: loc.lng };
  }
  if (typeof req?.latitude === "number" && typeof req?.longitude === "number") {
    return { lat: req.latitude, lng: req.longitude };
  }
  if (typeof req?.lat === "number" && typeof req?.lng === "number") {
    return { lat: req.lat, lng: req.lng };
  }
  return null;
}

// PUBLIC_INTERFACE
export function RequestDetailPage({ user }) {
  /** Mechanic request detail & status controls (now includes OpenStreetMap preview, Chennai default). */
  const { requestId } = useParams();
  const [req, setReq] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Canonical statuses (shared across apps)
  // Per attached requirements, mechanic flow is: assigned -> in_progress -> completed.
  // We keep labels professional and map to DB in dataService (EN_ROUTE/WORKING -> in_progress).
  const allowedStatuses = useMemo(() => ["ASSIGNED", "WORKING", "COMPLETED"], []);

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
      await dataService.updateRequestStatus({
        requestId: req.id,
        status,
        mechanic: user,
        noteText: note.trim() || undefined,
      });
      setNote("");
      await load();
    } catch (e) {
      setError(e.message || "Could not update status.");
    } finally {
      setBusy(false);
    }
  };

  // Defensive: req.notes may be null / object / string depending on schema variance.
  // Normalize to a stable array so slice/reverse/map never throw.
  // NOTE: Don't use hooks here; this component has early returns above and hooks must not be conditional.
  const notes = req?.notes;
  let normalizedNotes = [];

  if (Array.isArray(notes)) {
    normalizedNotes = notes;
  } else if (notes && typeof notes === "object") {
    if (Array.isArray(notes.items)) {
      normalizedNotes = notes.items;
    } else {
      const vals = Object.values(notes);
      if (Array.isArray(vals)) normalizedNotes = vals;
    }
  } else if (typeof notes === "string") {
    try {
      const parsed = JSON.parse(notes);
      if (Array.isArray(parsed)) {
        normalizedNotes = parsed;
      } else if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.items)) normalizedNotes = parsed.items;
        else {
          const vals = Object.values(parsed);
          if (Array.isArray(vals)) normalizedNotes = vals;
        }
      }
    } catch {
      // ignore
    }
  }

  if (error) {
    return (
      <div className="container">
        <Card title="Request detail">
          <div className="alert alert-error">{error}</div>
          <Link className="link" to="/dashboard">
            ← Back
          </Link>
        </Card>
      </div>
    );
  }
  if (!req) return <div className="container"><div className="skeleton">Loading…</div></div>;

  const marker = extractLatLng(req);

  return (
    <div className="container">
      <div className="hero">
        <h1 className="h1">Request {req.id.slice(0, 8)}</h1>
        <p className="lead">
          Current status: <strong>{statusLabel(req.status)}</strong>
        </p>
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
            <div>
              <span className="k">Plate</span>
              <span className="v">{req.vehicle?.plate || "—"}</span>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        <MapView
          center={marker || undefined}
          marker={marker || undefined}
          height={280}
          ariaLabel="Request location map"
        />
        <div className="hint" style={{ marginTop: 8 }}>
          {marker ? "Showing reported coordinates." : "No coordinates on this request yet — showing Chennai as default."}
        </div>
      </div>

      <Card title="Issue">
        <p style={{ marginTop: 0 }}>{req.issueDescription}</p>
        <div className="divider" />
        <div className="field">
          <label className="label" htmlFor="note">
            Progress note (optional)
          </label>
          <textarea
            id="note"
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g., On the way, ETA 15 minutes."
          />
        </div>
        <div className="row">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {allowedStatuses.map((s) => (
              <Button key={s} variant={s === "COMPLETED" ? "secondary" : "primary"} onClick={() => setStatus(s)} disabled={busy}>
                Set: {statusLabel(s)}
              </Button>
            ))}
          </div>
          <Link className="link" to="/assignments">
            ← Back to assignments
          </Link>
        </div>

        {normalizedNotes.length ? (
          <>
            <div className="divider" />
            <div>
              <div className="label">History</div>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--text)" }}>
                {normalizedNotes
                  .slice()
                  .reverse()
                  .map((n, idx) => (
                    <li key={n?.id || `${n?.at || "note"}_${idx}`} style={{ margin: "8px 0" }}>
                      <span style={{ color: "var(--muted)", fontWeight: 800 }}>
                        {n?.at ? new Date(n.at).toLocaleString() : "—"} • {n?.by || "System"}:
                      </span>{" "}
                      <span style={{ fontWeight: 700 }}>{n?.text || "—"}</span>
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
