"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setRefreshToken, setToken } from "./api";

export type SessionUser = {
  id: string;
  orgId: string;
  email: string;
  mobile: string;
  name: string;
  role: string;
  extension: string;
  isActive: boolean;
  sipPasswordSet?: boolean;
  phoneMode?: "desk" | "sip";
};

export type SessionOrg = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  planLabel: string;
  status: string;
  seats: number;
  seatsUsed: number;
  trialEndsAt: string;
  isPlatform: boolean;
  locked: boolean;
};

type Session = {
  user: SessionUser | null;
  org: SessionOrg | null;
  orgName: string;
  loading: boolean;
  login: (mobile: string, otp: string) => Promise<void>;
  register: (orgName: string, name: string, mobile: string, otp: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [org, setOrg] = useState<SessionOrg | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!getToken()) {
      setUser(null);
      setOrg(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api<{ user: SessionUser; org: SessionOrg }>("/auth/me");
      setUser(data.user);
      setOrg(data.org);
    } catch {
      clearToken();
      setUser(null);
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<Session>(
    () => ({
      user,
      org,
      orgName: org?.name || "",
      loading,
      async login(mobile, otp) {
        const data = await api<{ accessToken: string; refreshToken?: string; user: SessionUser }>(
          "/auth/login",
          { method: "POST", body: JSON.stringify({ mobile, otp }) },
        );
        setToken(data.accessToken);
        if (data.refreshToken) setRefreshToken(data.refreshToken);
        setUser(data.user);
        await refresh();
      },
      async register(orgName, name, mobile, otp) {
        const data = await api<{ accessToken: string; refreshToken?: string; user: SessionUser }>(
          "/auth/register",
          {
            method: "POST",
            body: JSON.stringify({ orgName, name, mobile, otp }),
          },
        );
        setToken(data.accessToken);
        if (data.refreshToken) setRefreshToken(data.refreshToken);
        setUser(data.user);
        await refresh();
      },
      logout() {
        void api("/auth/logout", { method: "POST" }).catch(() => undefined);
        clearToken();
        setUser(null);
        setOrg(null);
        window.location.href = "/";
      },
      refresh,
    }),
    [user, org, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession outside provider");
  return ctx;
}
