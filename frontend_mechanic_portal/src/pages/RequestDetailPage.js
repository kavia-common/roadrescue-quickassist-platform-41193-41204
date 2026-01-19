import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { MapView } from "../components/MapView";
import { dataService } from "../services/dataService";
import { statusLabel } from "../services/statusUtils";

function toFiniteNumber(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

function extractLatLng(req) {
  /**
   * Best-effort coordinate extraction.
   * Supports:
   * - req.location {lat,lng} (numbers or numeric strings)
   * - flat columns: latitude/longitude OR lat/lng (numbers or numeric strings)
   */
  const loc = req?.location;

  const locLat = toFiniteNumber(loc?.lat);
  const locLng = toFiniteNumber(loc?.lng);
  if (locLat != null && locLng != null) return { lat: locLat, lng: locLng };

  const lat1 = toFiniteNumber(req?.latitude);
  const lng1 = toFiniteNumber(req?.longitude);
  if (lat1 != null && lng1 != null) return { lat: lat1, lng: lng1 };

  const lat2 = toFiniteNumber(req?.lat);
  const lng2 = toFiniteNumber(req?.lng);
  if (lat2 != null && lng2 != null) return { lat: lat2, lng: lng2 };

  return null;
}

function extractAddressText(req) {
  /**
   * Best-effort address/location string for geocoding.
   * Supports:
   * - req.location JSON object with address-ish fields
   * - common flat fields used by list filtering and some DB schemas
   */
  const loc = req?.location;
  const nested =
    loc && typeof loc === "object"
      ? loc.formatted_address || loc.formattedAddress || loc.address || loc.name || loc.location_text || loc.locationText || ""
      : "";

  return (
    nested ||
    req?.locationText ||
    req?.location_text ||
    req?.pickupLocation ||
    req?.pickup_location ||
    req?.address ||
    ""
  )
    .toString()
    .trim();
}

async function geocodeAddress(address) {
  /**
   * Client-side geocoding using OpenStreetMap Nominatim (no API key).
   * This is best-effort and may be rate-limited in production; for scale, replace with
   * a backend/edge function or a paid geocoding provider.
   */
  const q = (address || "").trim();
  if (!q) return null;

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      // Nominatim requires a valid User-Agent/Referer; browsers limit User-Agent control,
      // so we at least send a descriptive Referer and Accept.
      Accept: "application/json",
    },
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit) return null;

  const lat = toFiniteNumber(hit.lat);
  const lng = toFiniteNumber(hit.lon);
  if (lat == null || lng == null) return null;

  return { lat, lng };
}

// PUBLIC_INTERFACE
export function RequestDetailPage({ user }) {
  /** Mechanic request detail & status controls (now includes OpenStreetMap preview, Chennai default). */
  const { requestId } = useParams();
  const [req, setReq] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Map marker derived either from stored coordinates or best-effort geocoding from address.
  const [mapMarker, setMapMarker] = useState(null);
  const [mapStatus, setMapStatus] = useState({ type: "", message: "" });

  // Statuses allowed by DB CHECK constraint (authoritative)
  const allowedStatuses = useMemo(() => ["assigned", "completed", "canceled"], []);

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

  useEffect(() => {
    let cancelled = false;

    // Whenever the loaded request changes, recompute the best marker.
    const direct = extractLatLng(req);
    if (direct) {
      setMapMarker(direct);
      setMapStatus({ type: "", message: "" });
      return () => {
        cancelled = true;
      };
    }

    const addr = extractAddressText(req);
    if (!addr) {
      setMapMarker(null);
      setMapStatus({ type: "", message: "" });
      return () => {
        cancelled = true;
      };
    }

    setMapStatus({ type: "info", message: "Finding location from address…" });

    (async () => {
      try {
        const geo = await geocodeAddress(addr);
        if (cancelled) return;
        if (geo) {
          setMapMarker(geo);
          setMapStatus({ type: "", message: "" });
        } else {
          setMapMarker(null);
          setMapStatus({ type: "info", message: "Could not geocode address for this request. Showing default map center." });
        }
      } catch {
        if (cancelled) return;
        setMapMarker(null);
        setMapStatus({ type: "info", message: "Geocoding failed. Showing default map center." });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [req?.id]); // keyed off req.id so status updates/notes don't re-geocode unnecessarily

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

  const marker = mapMarker;

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
        {mapStatus.message ? (
          <div className="alert alert-info" style={{ marginBottom: 10 }}>
            {mapStatus.message}
          </div>
        ) : null}

        <MapView
          center={marker || undefined}
          marker={marker || undefined}
          zoom={marker ? 15 : 12}
          height={280}
          ariaLabel="Request location map"
          fitToMarker
        />
        <div className="hint" style={{ marginTop: 8 }}>
          {marker
            ? extractLatLng(req)
              ? "Showing reported coordinates."
              : "Showing best-effort geocoded location from address."
            : "No usable coordinates/address on this request yet — showing Chennai as default."}
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
