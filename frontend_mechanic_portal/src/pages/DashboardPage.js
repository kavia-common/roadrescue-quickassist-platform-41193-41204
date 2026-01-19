import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Table } from "../components/ui/Table";
import { Button } from "../components/ui/Button";
import { RequestFiltersCard } from "../components/RequestFiltersCard";
import { dataService } from "../services/dataService";
import { filterRequests, countActiveFilters } from "../services/requestFilterUtils";
import { statusBadgeClass, statusLabel } from "../services/statusUtils";

function statusBadge(status) {
  return <span className={statusBadgeClass(status)}>{statusLabel(status)}</span>;
}

function renderVehicleCell(vehicle) {
  const make = vehicle?.make || "";
  const model = vehicle?.model || "";
  const label = `${make} ${model}`.trim();
  return label || "—";
}

const FILTERS_STORAGE_KEY = "rrqa.mechanic.dashboardFilters";

// PUBLIC_INTERFACE
export function DashboardPage({ user }) {
  /** Shows available requests; mechanics can accept them. */
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const [filters, setFilters] = useState(() => {
    /**
     * Do NOT restore/persist location:
     * Users reported an unintended default (e.g., "chengalpattu") being applied via localStorage.
     * Location filtering must apply only to current user input.
     *
     * We still persist non-location filters (issue/status) as a convenience.
     */
    try {
      const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        location: "",
        issue: parsed?.issue || "",
        status: parsed?.status || "",
      };
    } catch {
      return { location: "", issue: "", status: "" };
    }
  });

  // Persist last-used NON-location filters so they survive refresh/navigation.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          issue: filters.issue || "",
          status: filters.status || "",
        })
      );
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, [filters.issue, filters.status]);

  const load = async () => {
    setError("");
    try {
      const list = await dataService.listUnassignedRequests();
      setRows(list);
    } catch (e) {
      setError(e.message || "Could not load requests.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const accept = async (id) => {
    setBusyId(id);
    try {
      // acceptRequest returns updated request (Supabase + mock) for instant UI feedback
      await dataService.acceptRequest({ requestId: id, mechanic: user });

      // Optimistic local refresh: remove from "Available" list immediately.
      setRows((prev) => prev.filter((r) => r.id !== id));

      // Then reload for canonical truth (handles race/other accepts).
      await load();
    } catch (e) {
      setError(e.message || "Could not accept request.");
    } finally {
      setBusyId("");
    }
  };

  const filteredRows = useMemo(() => filterRequests(rows, filters), [rows, filters]);
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

  return (
    <div className="container">
      <div className="hero">
        <h1 className="h1">Dashboard</h1>
        <p className="lead">Available requests awaiting a mechanic.</p>
      </div>

      {!user.approved ? (
        <div className="alert alert-info">
          Your account is <strong>pending admin approval</strong>. You can browse, but accepting requests may be restricted by policy.
        </div>
      ) : null}

      <div style={{ marginBottom: 12 }}>
        <RequestFiltersCard
          title="Filters"
          subtitle="Filter available requests by location, issue description, and status."
          storageKey={FILTERS_STORAGE_KEY}
          filters={filters}
          onFiltersChange={(next) => setFilters(next)}
          onClear={() => setFilters({ location: "", issue: "", status: "" })}
        />
      </div>

      <Card
        title="Available requests"
        subtitle={
          activeFilterCount
            ? `Showing ${filteredRows.length} of ${rows.length} (filtered).`
            : "Accept to move into My Assignments."
        }
        actions={
          <Button variant="ghost" size="sm" onClick={load}>
            Refresh
          </Button>
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
            { key: "createdAt", header: "Created", render: (r) => new Date(r.createdAt).toLocaleString() },
            {
              key: "vehicle",
              header: "Vehicle",
              render: (r) => renderVehicleCell(r.vehicle),
            },
            { key: "status", header: "Status", render: (r) => statusBadge(r.status) },
            {
              key: "action",
              header: "Action",
              render: (r) => (
                <Button size="sm" onClick={() => accept(r.id)} disabled={busyId === r.id}>
                  {busyId === r.id ? "Accepting..." : "Accept"}
                </Button>
              ),
            },
          ]}
          rows={filteredRows}
          rowKey={(r) => r.id}
        />
      </Card>
    </div>
  );
}
