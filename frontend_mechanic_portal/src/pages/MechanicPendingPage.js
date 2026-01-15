import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";

function iconFor(status) {
  const common = { width: 64, height: 64, display: "grid", placeItems: "center", borderRadius: 16, fontWeight: 900 };
  if (status === "approved") return <div style={{ ...common, background: "rgba(16,185,129,0.12)", color: "#065F46" }}>✓</div>;
  if (status === "rejected" || status === "suspended") return <div style={{ ...common, background: "rgba(239,68,68,0.10)", color: "#991B1B" }}>✕</div>;
  if (status === "pending") return <div style={{ ...common, background: "rgba(245,158,11,0.10)", color: "#92400E" }}>⏳</div>;
  return <div style={{ ...common, background: "rgba(107,114,128,0.12)", color: "#374151" }}>…</div>;
}

function copyFor(status) {
  switch (status) {
    case "pending":
      return {
        title: "Application under review",
        description:
          "Thank you for applying. Your information is being reviewed by an administrator. You’ll receive access once your account is verified and approved.",
        tone: "badge badge-amber",
      };
    case "rejected":
      return {
        title: "Application Rejected",
        description: "Unfortunately, your mechanic application has been rejected. Please contact support for details.",
        tone: "badge",
      };
    case "suspended":
      return {
        title: "Account Suspended",
        description: "Your mechanic account has been suspended. Please contact support.",
        tone: "badge",
      };
    default:
      return {
        title: "No application on file",
        description: "We couldn’t find a mechanic application for your account. Please register to submit an application for review.",
        tone: "badge",
      };
  }
}

// PUBLIC_INTERFACE
export function MechanicPendingPage() {
  /** Pending approval screen for mechanic accounts; auto-redirects to dashboard when approved. */
  const { user, loading: authLoading, mechanicStatus, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (mechanicStatus === "approved") {
      navigate("/dashboard", { replace: true });
    }
  }, [mechanicStatus, navigate]);

  const content = copyFor(mechanicStatus);

  return (
    <div className="container">
      <div className="hero">
        <h1 className="h1">Mechanic Approval</h1>
        <p className="lead">Your access depends on admin verification.</p>
      </div>

      <Card
        title={content.title}
        subtitle={content.description}
        actions={mechanicStatus ? <span className={content.tone}>{mechanicStatus}</span> : null}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>{iconFor(mechanicStatus)}</div>

        {mechanicStatus === "pending" ? (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 12,
              background: "rgba(245,158,11,0.06)",
              marginBottom: 12,
            }}
          >
            <div className="label" style={{ marginBottom: 6 }}>
              What happens next
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)", fontWeight: 700, lineHeight: 1.7 }}>
              <li>An administrator will review your application and verify your information.</li>
              <li>If additional details are required, you may be contacted.</li>
              <li>Once approved, you’ll be able to access the dashboard and accept assignments.</li>
            </ul>
          </div>
        ) : null}

        <div className="row">
          {mechanicStatus !== "pending" ? (
            <Button variant="ghost" onClick={() => navigate("/auth?mode=register")}>
              Submit / Update application
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => navigate("/auth")}>
              Back to auth
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={async () => {
              await signOut();
              navigate("/auth", { replace: true });
            }}
          >
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
