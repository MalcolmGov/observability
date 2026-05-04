"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { PulseUser } from "@/lib/auth";

interface AuthContextType {
  user: PulseUser | null;
  availablePersonas: PulseUser[];
  switchPersona: (userId: string) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  availablePersonas: [],
  switchPersona: async () => {},
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PulseUser | null>(null);
  const [availablePersonas, setAvailablePersonas] = useState<PulseUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    try {
      const res = await fetch("/api/v1/auth/user");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setAvailablePersonas(data.availablePersonas || []);
      }
    } catch (e) {
      console.error("Failed to load user session", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUser();
  }, []);

  const switchPersona = async (userId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        // Reload to get new user and trigger re-renders
        window.location.reload();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, availablePersonas, switchPersona, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
