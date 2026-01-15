import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { dataService } from "../services/dataService";

/**
 * Mechanic status tokens (per user_input_ref):
 * - pending
 * - approved
 * - rejected
 * - suspended
 */

/**
 * @typedef {Object} AuthContextValue
 * @property {any|null} user
 * @property {boolean} loading
 * @property {string|null} mechanicStatus
 * @property {(email:string, password:string)=>Promise<{user:any|null, error:Error|null}>} signIn
 * @property {(params:{fullName:string, email:string, password:string, phone?:string, serviceArea?:string, specialization?:string[]})=>Promise<{user:any|null, error:Error|null}>} signUp
 * @property {()=>Promise<void>} signOut
 * @property {()=>Promise<void>} refresh
 */

const AuthContext = createContext(
  /** @type {AuthContextValue} */ ({
    user: null,
    loading: true,
    mechanicStatus: null,
    signIn: async () => ({ user: null, error: new Error("AuthProvider missing") }),
    signUp: async () => ({ user: null, error: new Error("AuthProvider missing") }),
    signOut: async () => {},
    refresh: async () => {},
  })
);

// PUBLIC_INTERFACE
export function AuthProvider({ children }) {
  /** Provides auth session, mechanicStatus, and auth helpers for the mechanic portal. */
  const [user, setUser] = useState(null);
  const [mechanicStatus, setMechanicStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const u = await dataService.getCurrentUser();
      setUser(u);

      if (u) {
        const status = await dataService.getMechanicStatus(u.id);
        setMechanicStatus(status);
      } else {
        setMechanicStatus(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      mechanicStatus,
      signIn: async (email, password) => {
        try {
          const u = await dataService.login(email, password);
          setUser(u);
          const status = await dataService.getMechanicStatus(u.id);
          setMechanicStatus(status);
          return { user: u, error: null };
        } catch (e) {
          return { user: null, error: e instanceof Error ? e : new Error("Login failed.") };
        }
      },
      signUp: async (params) => {
        try {
          const u = await dataService.registerMechanic(params);
          setUser(u);
          const status = await dataService.getMechanicStatus(u.id);
          setMechanicStatus(status);
          return { user: u, error: null };
        } catch (e) {
          return { user: null, error: e instanceof Error ? e : new Error("Registration failed.") };
        }
      },
      signOut: async () => {
        await dataService.logout();
        setUser(null);
        setMechanicStatus(null);
      },
      refresh,
    }),
    [user, loading, mechanicStatus]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// PUBLIC_INTERFACE
export function useAuth() {
  /** Hook to access auth context (user, loading, mechanicStatus, and auth helpers). */
  return useContext(AuthContext);
}
