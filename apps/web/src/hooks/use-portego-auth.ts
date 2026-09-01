"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api";

export type PortegoUser = {
  id: string;
  email: string;
  displayName: string;
};

export type PortegoSession = {
  authenticated: boolean;
  user: PortegoUser | null;
  hasHome: boolean;
  csrfToken: string | null;
};

const signedOut: PortegoSession = {
  authenticated: false,
  user: null,
  hasHome: false,
  csrfToken: null,
};

export function usePortegoAuth() {
  const [session, setSession] = useState<PortegoSession>(signedOut);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await apiRequest<PortegoSession>("/api/auth/session", { cache: "no-store" });
      setSession(next);
      setError(null);
      return next;
    } catch {
      setSession(signedOut);
      return signedOut;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const next = await apiRequest<PortegoSession>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setSession(next);
      setError(null);
      return next;
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Login failed.";
      setError(message);
      throw loginError;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await apiRequest<void>("/api/auth/logout", {
      method: "POST",
      csrfToken: session.csrfToken,
    });
    setSession(signedOut);
    setError(null);
  }, [session.csrfToken]);

  const updateProfile = useCallback(
    async (input: { displayName?: string; currentPassword?: string; newPassword?: string }) => {
      const next = await apiRequest<PortegoSession>("/api/auth/me", {
        method: "PATCH",
        csrfToken: session.csrfToken,
        body: JSON.stringify(input),
      });
      setSession(next);
      return next;
    },
    [session.csrfToken],
  );

  const markHomeCreated = useCallback(() => {
    setSession((current) => ({ ...current, hasHome: true }));
  }, []);

  return {
    ...session,
    loading,
    error,
    login,
    logout,
    refresh,
    updateProfile,
    markHomeCreated,
  };
}
