"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { User } from "./types";
import { apiFetch } from "./api";
import { DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES } from "./session-timeout";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES);
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    // The HttpOnly cookie is intentionally inaccessible to JavaScript. The
    // server decides whether the current browser session is authenticated.
    apiFetch<{ user: User }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Le délai est un paramètre système administré côté serveur. Il est relu
  // périodiquement afin qu'une modification du Super Admin s'applique aussi
  // aux sessions déjà ouvertes.
  useEffect(() => {
    if (!user) {
      setIdleTimeoutMinutes(DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES);
      return;
    }
    let disposed = false;
    const refreshTimeout = async () => {
      try {
        const data = await apiFetch<{ idleTimeoutMinutes: number }>("/api/auth/idle-timeout");
        if (!disposed && Number.isFinite(data.idleTimeoutMinutes) && data.idleTimeoutMinutes > 0) {
          setIdleTimeoutMinutes(data.idleTimeoutMinutes);
        }
      } catch { /* la valeur actuelle reste active si la base est momentanément indisponible */ }
    };
    void refreshTimeout();
    const interval = window.setInterval(refreshTimeout, 60_000);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [user]);



  const login = useCallback(async (username: string, password: string) => {
    const data = await apiFetch<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setUser(null);
  }, []);

  useEffect(() => {
    if (!user || idleTimeoutMinutes <= 0) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastActivityEvent = 0;
    const timeoutMs = idleTimeoutMinutes * 60_000;
    const scheduleLogout = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void logout(); }, timeoutMs);
    };
    const onActivity = () => {
      const now = Date.now();
      // Les mouvements de souris peuvent être très fréquents : une
      // reprogrammation au maximum par seconde suffit pour rester précis.
      if (now - lastActivityEvent < 1_000) return;
      lastActivityEvent = now;
      scheduleLogout();
    };
    const events: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "pointerdown"];
    events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
    scheduleLogout();
    return () => {
      if (timer) clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, onActivity));
    };
  }, [user, idleTimeoutMinutes, logout]);
  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
