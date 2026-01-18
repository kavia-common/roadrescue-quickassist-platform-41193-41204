import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Table } from "../components/ui/Table";
import { Input } from "../components/ui/Input";
import { dataService } from "../services/dataService";
import { statusBadgeClass, statusLabel, normalizeStatus } from "../services/statusUtils";
import { subscribeRequestsChanged } from "../services/requestEvents";

const STATUS_FILTERS = [
  { value: "", label: "All Statuses" },
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
export function MyAssignmentsPage({ user }) {
  /** Shows requests assigned to current mechanic. */
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = async () => {
    setError("");
    const list = await dataService.listMyAssignments(user.id);
    setRows(list);
  };

  useEffect(() => {
    let mounted = true;

    const safeLoad = async () => {
      try {
        await load();
      } catch (e) {
        if (mounted) setError(e.message || "Could not load assignments.");
      }
    };

    safeLoad();

    // Cross-page propagation: refresh if any request changes (accept/status update).
    const offLocal = subscribeRequestsChanged(() => {
      safeLoad();
    });

    // Best-effort Supabase realtime subscription (no-op in mock mode).
    const offRealtime = dataService.subscribeToRequestsChanges(() => {
      safeLoad();
    });

    return () => {
      mounted = false;
      offLocal?.();
      offRealtime?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Memoized filter
  const filteredRows = useMemo(() => {
    let filtered = rows;
    if (statusFilter) {
      filtered = filtered.filter((r) => normalizeStatus(r.status) === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((r) =>
        [r.id, r.userEmail, r.vehicle?.make, r.vehicle?.model, r.vehicle?.plate]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase())
          .some((s) => s.includes(q))
      );
    }
    return filtered;
  }, [rows, statusFilter, search]);

  return (
    <div className="container">
      <div className="hero">
        <h1 className="h1">My assignments</h1>
        <p className="lead">Update status as you progress: Accepted → En Route → Working → Completed.</p>
      </div>

      <Card
        title="Assigned requests"
        subtitle="Click into a request to update status."
        actions={
          <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
            <div>
              <Input
                name="assignments-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Search by ID, customer, vehicle..."
              />
            </div>
            <div>
              <select
                className="input"
                style={{ minWidth: 140 }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {STATUS_FILTERS.map((opt) => (
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
              key: "vehicle",
              header: "Vehicle",
              render: (r) => renderVehicleCell(r.vehicle),
            },
            { key: "status", header: "Status", render: (r) => statusBadge(r.status) },
            { key: "userEmail", header: "Customer", render: (r) => r.userEmail },
          ]}
          rows={filteredRows}
          rowKey={(r) => r.id}
        />
      </Card>
    </div>
  );
}
