import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Table } from "../components/ui/Table";
import { dataService } from "../services/dataService";
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

function renderIssueCell(r) {
  return r?.issueDescription || r?.issue_description || r?.issue || r?.description || "—";
}

// PUBLIC_INTERFACE
export function MyAssignmentsPage({ user }) {
  /** Shows requests assigned to current mechanic. */
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

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

  return (
    <div className="container">
      <div className="hero">
        <h1 className="h1">My assignments</h1>
        <p className="lead">Update status as you progress: Accepted → En Route → Working → Completed.</p>
      </div>

      <Card title="Assigned requests" subtitle="Click into a request to update status.">
        {error ? <div className="alert alert-error">{error}</div> : null}
        <Table
          columns={[
            { key: "id", header: "Request", render: (r) => <Link className="link" to={`/requests/${r.id}`}>{r.id.slice(0, 8)}</Link> },
            {
              key: "vehicle",
              header: "Vehicle",
              render: (r) => renderVehicleCell(r?.vehicle),
            },
            {
              key: "issue_description",
              header: "Issue",
              render: (r) => renderIssueCell(r),
            },
            { key: "status", header: "Status", render: (r) => statusBadge(r.status) },
            { key: "userEmail", header: "Customer", render: (r) => r?.userEmail || "—" },
          ]}
          rows={rows}
          rowKey={(r) => r.id}
        />
      </Card>
    </div>
  );
}
