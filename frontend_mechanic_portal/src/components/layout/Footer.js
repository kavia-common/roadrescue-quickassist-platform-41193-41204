import React from "react";

// PUBLIC_INTERFACE
export function Footer() {
  /** Footer for mechanic portal. */
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>© {new Date().getFullYear()} RoadRescue – QuickAssist</div>
        <div className="footer-muted">Mechanic Portal • Mock/Supabase shared storage</div>
      </div>
    </footer>
  );
}
