import React from "react";
import { Navigate, useLocation } from "react-router-dom";

/**
 * requireApproved:
 * - when true, only mechanics with mechanicStatus === 'approved' can enter.
 * - others are routed to /pending.
 */

// PUBLIC_INTERFACE
export function RequireAuth({ user, mechanicStatus, requireApproved = false, children }) {
  /** Route guard: redirects unauthenticated users to /auth and non-approved mechanics to /pending. */
  const location = useLocation();

  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;

  if (requireApproved && mechanicStatus !== "approved") {
    return <Navigate to="/pending" replace state={{ from: location.pathname }} />;
  }

  return children;
}
