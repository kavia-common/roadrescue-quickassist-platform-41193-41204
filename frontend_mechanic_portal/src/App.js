import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";

import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
import { RequireAuth } from "./routes/RequireAuth";

import { AuthProvider, useAuth } from "./hooks/useAuth";

import { MechanicAuthPage } from "./pages/MechanicAuthPage";
import { MechanicPendingPage } from "./pages/MechanicPendingPage";

import { DashboardPage } from "./pages/DashboardPage";
import { MyAssignmentsPage } from "./pages/MyAssignmentsPage";
import { RequestDetailPage } from "./pages/RequestDetailPage";
import { ProfilePage } from "./pages/ProfilePage";
import { TwilioSmsDemoCard } from "./components/demo/TwilioSmsDemoCard";

function AppRoutes() {
  const { user, loading, mechanicStatus } = useAuth();

  if (loading) return <div className="app-shell"><div className="container"><div className="skeleton">Loading…</div></div></div>;

  return (
    <>
      <Navbar user={user} mechanicStatus={mechanicStatus} />
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to={user ? "/dashboard" : "/auth"} replace />} />
          <Route path="/auth" element={<MechanicAuthPage />} />
          <Route path="/pending" element={<MechanicPendingPage />} />

          <Route
            path="/dashboard"
            element={
              <RequireAuth user={user} mechanicStatus={mechanicStatus} requireApproved>
                <DashboardPage user={user} />
              </RequireAuth>
            }
          />
          <Route
            path="/assignments"
            element={
              <RequireAuth user={user} mechanicStatus={mechanicStatus} requireApproved>
                <MyAssignmentsPage user={user} />
              </RequireAuth>
            }
          />
          <Route
            path="/requests/:requestId"
            element={
              <RequireAuth user={user} mechanicStatus={mechanicStatus} requireApproved>
                <RequestDetailPage user={user} />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth user={user} mechanicStatus={mechanicStatus} requireApproved>
                <ProfilePage user={user} />
              </RequireAuth>
            }
          />

          <Route
            path="/demo-sms"
            element={
              <RequireAuth user={user} mechanicStatus={mechanicStatus} requireApproved>
                <div className="container">
                  <div className="hero">
                    <h1 className="h1">SMS Demo</h1>
                    <p className="lead">Simulate the mocked “Mechanic accepts job” event.</p>
                  </div>
                  <TwilioSmsDemoCard title="Mechanic accepts job (Demo)" />
                </div>
              </RequireAuth>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}

// PUBLIC_INTERFACE
function App() {
  /** Mechanic portal entry: auth -> pending approval -> approved dashboard. */
  return (
    <BrowserRouter>
      <div className="app-shell">
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </div>
    </BrowserRouter>
  );
}

export default App;
