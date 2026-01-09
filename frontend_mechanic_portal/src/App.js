import React, { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";

import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
import { RequireAuth } from "./routes/RequireAuth";
import { dataService } from "./services/dataService";

import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { PendingApprovalPage } from "./pages/PendingApprovalPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MyAssignmentsPage } from "./pages/MyAssignmentsPage";
import { RequestDetailPage } from "./pages/RequestDetailPage";
import { ProfilePage } from "./pages/ProfilePage";

// PUBLIC_INTERFACE
function App() {
  /** Mechanic portal entry: accept requests and update their status. */
  const [user, setUser] = useState(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const u = await dataService.getCurrentUser();
      if (mounted) {
        setUser(u);
        setBooted(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!booted) return <div className="app-shell"><div className="container"><div className="skeleton">Loading…</div></div></div>;

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Navbar user={user} />
        <main className="main">
          <Routes>
            <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
            <Route path="/login" element={<LoginPage onAuthed={setUser} />} />
            <Route path="/register" element={<RegisterPage onAuthed={setUser} />} />

            <Route
              path="/pending"
              element={
                <RequireAuth user={user}>
                  <PendingApprovalPage user={user} />
                </RequireAuth>
              }
            />

            <Route
              path="/dashboard"
              element={
                <RequireAuth user={user}>
                  {user?.approved ? <DashboardPage user={user} /> : <Navigate to="/pending" replace />}
                </RequireAuth>
              }
            />
            <Route
              path="/assignments"
              element={
                <RequireAuth user={user}>
                  {user?.approved ? <MyAssignmentsPage user={user} /> : <Navigate to="/pending" replace />}
                </RequireAuth>
              }
            />
            <Route
              path="/requests/:requestId"
              element={
                <RequireAuth user={user}>
                  {user?.approved ? <RequestDetailPage user={user} /> : <Navigate to="/pending" replace />}
                </RequireAuth>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth user={user}>
                  {user?.approved ? <ProfilePage user={user} onUserUpdated={setUser} /> : <Navigate to="/pending" replace />}
                </RequireAuth>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
