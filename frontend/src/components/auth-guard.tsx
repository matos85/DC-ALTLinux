"use client";

import { ReactNode } from "react";

import { useAuth } from "@/components/auth-provider";

/** Дополнительная защита контента; основной вход и скрытие меню — в AppShell. */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return null;
  }

  return <>{children}</>;
}
