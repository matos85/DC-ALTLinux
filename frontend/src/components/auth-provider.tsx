"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";

import {
  apiRequest,
  clearStoredTokens,
  formatApiError,
  getStoredAccessToken,
  loginRequest,
} from "@/lib/client-api";

export type PanelUser = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  role: string;
  is_active: boolean;
  is_pro_mode: boolean;
};

/** Только явный boolean true из API считается включённым Pro (иначе «ложные» truthy из JSON). */
export function parsePanelUser(data: unknown): PanelUser {
  if (!data || typeof data !== "object") {
    throw new Error("Некорректный ответ профиля.");
  }
  const r = data as Record<string, unknown>;
  return {
    id: Number(r.id),
    username: String(r.username ?? ""),
    email: String(r.email ?? ""),
    first_name: String(r.first_name ?? ""),
    last_name: String(r.last_name ?? ""),
    display_name: String(r.display_name ?? ""),
    role: String(r.role ?? ""),
    is_active: r.is_active === true,
    is_pro_mode: r.is_pro_mode === true,
  };
}

type ProfilePayload = Partial<
  Pick<PanelUser, "username" | "email" | "first_name" | "last_name" | "display_name" | "is_pro_mode">
>;

type AuthContextValue = {
  user: PanelUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateProfile: (payload: ProfilePayload) => Promise<PanelUser>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<string>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PanelUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshUser() {
    const hasToken = Boolean(getStoredAccessToken());
    if (!hasToken) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const raw = await apiRequest<unknown>("/auth/me/");
      setUser(parsePanelUser(raw));
    } catch {
      clearStoredTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshUser();
  }, []);

  async function login(username: string, password: string) {
    await loginRequest(username, password);
    setLoading(true);
    try {
      const raw = await apiRequest<unknown>("/auth/me/");
      setUser(parsePanelUser(raw));
    } catch {
      clearStoredTokens();
      setUser(null);
      throw new Error("Вход отклонён: не удалось загрузить профиль. Проверьте пароль и доступность API (NEXT_PUBLIC_API_URL / backend).");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearStoredTokens();
    setUser(null);
  }

  async function updateProfile(payload: ProfilePayload) {
    const raw = await apiRequest<unknown>("/auth/me/", {
      method: "PATCH",
      body: payload,
    });
    const updated = parsePanelUser(raw);
    setUser(updated);
    return updated;
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const response = await apiRequest<{ detail: string }>("/auth/me/change-password/", {
      method: "POST",
      body: {
        current_password: currentPassword,
        new_password: newPassword,
      },
    });
    return response.detail;
  }

  const value: AuthContextValue = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    login,
    logout,
    refreshUser,
    updateProfile,
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(formatApiError("AuthProvider не найден в дереве React."));
  }
  return context;
}
