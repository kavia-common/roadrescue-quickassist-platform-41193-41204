import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";
import { dataService } from "../../services/dataService";

function statusChipText(mechanicStatus, user) {
  // Supabase mode: prefer mechanics.status
  if (mechanicStatus) return mechanicStatus === "approved" ? "Approved" : mechanicStatus === "pending" ? "Pending approval" : mechanicStatus;

  // Mock mode fallback: existing user.approved boolean
  if (user?.approved === true) return "Approved";
  if (user) return "Pending approval";
  return "";
}

// PUBLIC_INTERFACE
export function Navbar({ user, mechanicStatus }) {
  /** Mechanic portal top navigation. */
  const navigate = useNavigate();

  // PUBLIC_INTERFACE
  const onLogout = async () => {
    // Respect Supabase mode: signOut with redirect if configured
    if (dataService.isSupabaseConfigured()) {
      // signOut (redirect back to homepage or auth)
      const siteUrl = process.env.REACT_APP_FRONTEND_URL || process.env.REACT_APP_SITE_URL || window.location.origin;
      const { createClient } = await import("@supabase/supabase-js");
      const supa = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_KEY
      );
      // signOut supports redirectTo for OIDC/session clean
      await supa.auth.signOut({ redirectTo: siteUrl + "/auth" });
      // The redirect will occur, but act as fallback
      setTimeout(() => {
        navigate("/auth");
      }, 100);
      return;
    }
    await dataService.logout();
    navigate("/auth");
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          RoadRescue <span className="brand-accent">Mechanic</span>
        </Link>

        <nav className="navlinks" aria-label="Primary navigation">
          {user ? (
            <>
              <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "navlink active" : "navlink")}>
                Dashboard
              </NavLink>
              <NavLink to="/assignments" className={({ isActive }) => (isActive ? "navlink active" : "navlink")}>
                My Assignments
              </NavLink>
              <NavLink to="/profile" className={({ isActive }) => (isActive ? "navlink active" : "navlink")}>
                Profile
              </NavLink>
              <NavLink to="/demo-sms" className={({ isActive }) => (isActive ? "navlink active" : "navlink")}>
                SMS Demo
              </NavLink>
            </>
          ) : null}
        </nav>

        <div className="nav-right">
          {user ? (
            <>
              <span className="chip">{statusChipText(mechanicStatus, user)}</span>
              <Button variant="ghost" onClick={onLogout}>
                Log out
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
