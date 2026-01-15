import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// PUBLIC_INTERFACE
export function LoginPage() {
  /** Legacy route compatibility: redirect /login -> /auth. */
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/auth", { replace: true });
  }, [navigate]);

  return null;
}
