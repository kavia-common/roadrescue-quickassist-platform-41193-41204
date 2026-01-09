import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { dataService } from "../services/dataService";

// PUBLIC_INTERFACE
export function PendingApprovalPage({ user }) {
  /** Pending gating screen: shown when mechanic profile.status !== 'approved'. */
  const [checking, setChecking] = useState(false);
  const [freshUser, setFreshUser] = useState(user || null);
  const [error, setError] = useState("");

  useEffect(() => {
    setFreshUser(user || null);
  }, [user]);

  const refresh = async () => {
    setChecking(true);
    setError("");
    try {
      const u = await dataService.getCurrentUser();
      setFreshUser(u);
    } catch (e) {
      setError(e?.message || "Could not refresh status.");
    } finally {
      setChecking(false);
    }
  };

  const statusLabel = freshUser?.approved ? "Approved" : "Pending";

  return (
    <div className="container">
      <div className="hero">
        <h1 className="h1">Awaiting admin approval</h1>
        <p className="lead">Your mechanic account is not approved yet. You’ll be able to access the dashboard once approved.</p>
      </div>

      <Card
        title="Account status"
        subtitle="Pending mechanics are blocked from viewing/accepting requests (enforced by app + Supabase policies)."
        actions={
          <Link className="link" to="/login">
            Back to login
          </Link>
        }
      >
        <div className="kv">
          <div>
            <span className="k">Email</span>
            <span className="v">{freshUser?.email || "—"}</span>
          </div>
          <div>
            <span className="k">Status</span>
            <span className="v">
              <span className="badge badge-amber">{statusLabel}</span>
            </span>
          </div>
        </div>

        <div className="divider" />

        <div className="alert alert-info">
          Your account is awaiting admin approval. If you just got approved, click <strong>Refresh status</strong>.
        </div>

        {error ? <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div> : null}

        <div className="row">
          <Button variant="primary" onClick={refresh} disabled={checking}>
            {checking ? "Checking..." : "Refresh status"}
          </Button>
          <Button variant="ghost" onClick={() => dataService.logout()}>
            Log out
          </Button>
        </div>
      </Card>
    </div>
  );
}
