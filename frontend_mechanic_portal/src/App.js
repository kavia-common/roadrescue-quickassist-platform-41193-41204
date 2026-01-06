import React, { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";

import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
import { RequireAuth } from "./routes/RequireAuth";
import { dataService } from "./services/dataService";

import { LoginPage } from "./pages/LoginPage";
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

            <Route
              path="/dashboard"
              element={
                <RequireAuth user={user}>
                  <DashboardPage user={user} />
                </RequireAuth>
              }
            />
            <Route
              path="/assignments"
              element={
                <RequireAuth user={user}>
                  <MyAssignmentsPage user={user} />
                </RequireAuth>
              }
            />
            <Route
              path="/requests/:requestId"
              element={
                <RequireAuth user={user}>
                  <RequestDetailPage user={user} />
                </RequireAuth>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth user={user}>
                  <ProfilePage user={user} onUserUpdated={setUser} />
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
