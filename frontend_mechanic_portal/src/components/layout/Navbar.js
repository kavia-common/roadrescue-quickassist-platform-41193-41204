import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";
import { dataService } from "../../services/dataService";

// PUBLIC_INTERFACE
export function Navbar({ user }) {
  /** Mechanic portal top navigation. */
  const navigate = useNavigate();

  const onLogout = async () => {
    await dataService.logout();
    navigate("/login");
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
              <span className="chip">{user.approved ? "Approved" : "Pending approval"}</span>
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
