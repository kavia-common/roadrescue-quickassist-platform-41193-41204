import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Table } from "../components/ui/Table";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { dataService } from "../services/dataService";
import { statusBadgeClass, statusLabel, normalizeStatus } from "../services/statusUtils";
import { subscribeRequestsChanged } from "../services/requestEvents";

/*
 * Statuses supported for filter dropdown
 */
const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "OPEN", label: "Open" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "EN_ROUTE", label: "En Route" },
  { value: "WORKING", label: "Working" },
  { value: "COMPLETED", label: "Completed" },
];

function statusBadge(status) {
  return <span className={statusBadgeClass(status)}>{statusLabel(status)}</span>;
}

function renderVehicleCell(vehicle) {
  const make = vehicle?.make || "";
  const model = vehicle?.model || "";
  const label = `${make} ${model}`.trim();
  return label || "—";
}

// PUBLIC_INTERFACE
export function DashboardPage({ user }) {
  /** Shows all requests with accurate status labels; mechanics can accept OPEN/unassigned ones. Includes search & status filtering with realtime update. */
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = async () => {
    setError("");
    try {
      const list = await dataService.listAllRequests();
      setRows(list);
    } catch (e) {
      setError(e.message || "Could not load requests.");
    }
  };

  useEffect(() => {
    load();

    // Cross-page propagation: refresh if any request changes (accept/status update).
    const offLocal = subscribeRequestsChanged(() => {
      load();
    });

    // Best-effort Supabase realtime subscription (no-op in mock mode).
    const offRealtime = dataService.subscribeToRequestsChanges(() => {
      load();
    });

    return () => {
      offLocal?.();
      offRealtime?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtered and searched rows - memoized
  const filteredRows = useMemo(() => {
    let filtered = rows;

    if (statusFilter) {
      filtered = filtered.filter(
        (r) => normalizeStatus(r.status) === statusFilter
      );
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((r) =>
        [r.id, r.userEmail, r.vehicle?.make, r.vehicle?.model, r.vehicle?.plate, r.assignedMechanicEmail]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase())
          .some((s) => s.includes(q))
      );
    }

    return filtered;
  }, [rows, search, statusFilter]);

  const accept = async (id) => {
    setBusyId(id);
    try {
      if (!user?.approved) {
        throw new Error("Your mechanic account is pending approval. You cannot accept requests yet.");
      }

      // acceptRequest returns updated request (Supabase + mock) for instant UI feedback
      await dataService.acceptRequest({ requestId: id, mechanic: user });

      // Then reload for canonical truth (handles race/other accepts).
      await load();
    } catch (e) {
      setError(e.message || "Could not accept request.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="container">
      <div className="hero">
        <h1 className="h1">Dashboard</h1>
        <p className="lead">All breakdown requests with live status (Open / Assigned / Completed).</p>
      </div>

      {!user.approved ? (
        <div className="alert alert-info">
          Your account is <strong>pending admin approval</strong>. You can browse requests, but you cannot accept assignments until you are approved.
        </div>
      ) : null}

      <Card
        title="Requests"
        subtitle="Statuses update in realtime. You can only accept OPEN + unassigned requests."
        actions={
          <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
            <div>
              <Input
                name="dashboard-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Search by ID, email, vehicle, plate"
              />
            </div>
            <div>
              <select
                className="input"
                style={{ minWidth: 140 }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option value={opt.value} key={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        }
      >
        {error ? <div className="alert alert-error">{error}</div> : null}
        <Table
          columns={[
            {
              key: "id",
              header: "Request",
              render: (r) => (
                <Link className="link" to={`/requests/${r.id}`}>
                  {r.id.slice(0, 8)}
                </Link>
              ),
            },
            {
              key: "createdAt",
              header: "Created",
              render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"),
            },
            {
              key: "vehicle",
              header: "Vehicle",
              render: (r) => renderVehicleCell(r.vehicle),
            },
            {
              key: "assignedMechanicEmail",
              header: "Assigned To",
              render: (r) => r.assignedMechanicEmail || "—",
            },
            { key: "status", header: "Status", render: (r) => statusBadge(r.status) },
            {
              key: "action",
              header: "Action",
              render: (r) => {
                const canAccept = normalizeStatus(r.status) === "OPEN" && !r.assignedMechanicId && user?.approved;
                if (!canAccept) return <span className="hint">—</span>;
                return (
                  <Button size="sm" onClick={() => accept(r.id)} disabled={busyId === r.id}>
                    {busyId === r.id ? "Accepting..." : "Accept"}
                  </Button>
                );
              },
            },
          ]}
          rows={filteredRows}
          rowKey={(r) => r.id}
        />
      </Card>
    </div>
  );
}
