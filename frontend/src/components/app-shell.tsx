"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AuthConsole } from "@/components/auth-console";
import { useAuth } from "@/components/auth-provider";
import { Sidebar } from "@/components/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user && pathname !== "/") {
      router.replace("/");
    }
  }, [loading, user, pathname, router]);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (user && pathname === "/") {
      router.replace("/dashboard");
    }
  }, [loading, user, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
        <div className="text-center text-sm text-slate-400">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
          Проверка сессии…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl shadow-slate-950/50">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-400">Domain Admin</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Вход администратора</h1>
          <p className="mt-2 text-sm text-slate-400">
            Эта страница только для авторизации. После входа вы попадёте на дашборд панели.
          </p>
          <div className="mt-8">
            <AuthConsole />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 p-6 lg:p-8">{children}</main>
    </div>
  );
}
