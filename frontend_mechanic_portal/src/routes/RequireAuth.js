import React from "react";
import { Navigate, useLocation } from "react-router-dom";

// PUBLIC_INTERFACE
export function RequireAuth({ user, children }) {
  /** Redirect to /login when not logged in. */
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
