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

const FILTERS_STORAGE_KEY = "rrqa.mechanic.assignmentsFilters";

// PUBLIC_INTERFACE
export function MyAssignmentsPage({ user }) {
  /** Shows requests assigned to current mechanic. */
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

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
      // ignore
    }
  }, [filters.issue, filters.status]);

  const load = async () => {
    setError("");
    const list = await dataService.listMyAssignments(user.id);
    setRows(list);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await dataService.listMyAssignments(user.id);
        if (mounted) setRows(list);
      } catch (e) {
        if (mounted) setError(e.message || "Could not load assignments.");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user.id]);

  const filteredRows = useMemo(() => filterRequests(rows, filters), [rows, filters]);
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

  return (
    <div className="container">
      <div className="hero">
        <h1 className="h1">My assignments</h1>
        <p className="lead">Update status as you progress: Assigned → Completed (or Canceled).</p>
      </div>

      <div style={{ marginBottom: 12 }}>
        <RequestFiltersCard
          title="Filters"
          subtitle="Filter your assignments by location, issue description, and status."
          storageKey={FILTERS_STORAGE_KEY}
          filters={filters}
          onFiltersChange={(next) => setFilters(next)}
          onClear={() => setFilters({ location: "", issue: "", status: "" })}
        />
      </div>

      <Card
        title="Assigned requests"
        subtitle={activeFilterCount ? `Showing ${filteredRows.length} of ${rows.length} (filtered).` : "Click into a request to update status."}
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
