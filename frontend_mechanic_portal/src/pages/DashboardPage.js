import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Table } from "../components/ui/Table";
import { Button } from "../components/ui/Button";
import { dataService } from "../services/dataService";

function statusBadge(status) {
  const map = {
    Submitted: "badge badge-blue",
    "In Review": "badge badge-amber",
    Accepted: "badge badge-blue",
    "En Route": "badge badge-amber",
    Working: "badge badge-amber",
    Completed: "badge badge-green",
  };
  return <span className={map[status] || "badge"}>{status}</span>;
}

function renderVehicleCell(vehicle) {
  const make = vehicle?.make || "";
  const model = vehicle?.model || "";
  const label = `${make} ${model}`.trim();
  return label || "—";
}

// PUBLIC_INTERFACE
export function DashboardPage({ user }) {
  /** Shows available requests; mechanics can accept them. */
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

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
      await dataService.acceptRequest({ requestId: id, mechanic: user });
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
        <p className="lead">Available requests awaiting a mechanic.</p>
      </div>

      {!user.approved ? (
        <div className="alert alert-info">
          Your account is <strong>pending admin approval</strong>. You can browse, but accepting requests may be restricted by policy.
        </div>
      ) : null}

      <Card title="Available requests" subtitle="Accept to move into My Assignments.">
        {error ? <div className="alert alert-error">{error}</div> : null}
        <Table
          columns={[
            { key: "id", header: "Request", render: (r) => <Link className="link" to={`/requests/${r.id}`}>{r.id.slice(0, 8)}</Link> },
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
          rows={rows}
          rowKey={(r) => r.id}
        />
      </Card>
    </div>
  );
}
