"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import {
  IconComputer,
  IconCog,
  IconDashboard,
  IconFolder,
  IconGlobe,
  IconLogout,
  IconPanelToggle,
  IconQueue,
  IconServer,
  IconTree,
  IconUserGroup,
  IconUsers,
} from "@/components/nav-icons";

const STORAGE_KEY = "panel-sidebar-collapsed";

type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Дашборд", Icon: IconDashboard },
  { href: "/users", label: "Пользователи", Icon: IconUsers },
  { href: "/groups", label: "Группы", Icon: IconUserGroup },
  { href: "/shares", label: "Шары и ACL", Icon: IconFolder },
  { href: "/computers", label: "Компьютеры", Icon: IconComputer },
  { href: "/ous", label: "OU", Icon: IconTree },
  { href: "/dns", label: "DNS", Icon: IconGlobe },
  { href: "/servers", label: "Серверы", Icon: IconServer },
  { href: "/jobs", label: "Задачи и аудит", Icon: IconQueue },
  { href: "/settings", label: "Настройки", Icon: IconCog },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
      } catch {
        /* ignore */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  function handleLogout() {
    logout();
    router.push("/");
  }

  return (
    <aside
      className={[
        "shrink-0 border-r border-slate-800 bg-slate-900/70 transition-[width] duration-200 ease-out",
        collapsed ? "w-[4.5rem] px-2 py-4" : "w-72 p-6",
      ].join(" ")}
    >
      <div className={collapsed ? "mb-4 flex flex-col items-center gap-2" : "mb-6"}>
        <div className="flex w-full items-start justify-between gap-2">
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-400">Domain Admin</p>
              <h1 className="mt-1 text-xl font-semibold leading-tight text-white">Control Center</h1>
            </div>
          ) : (
            <span className="sr-only">Domain Admin</span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Развернуть меню" : "Свернуть меню"}
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
            className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <IconPanelToggle className={["h-5 w-5 transition-transform", collapsed ? "rotate-180" : ""].join(" ")} />
          </button>
        </div>
        {!collapsed ? (
          <p className="mt-3 text-sm text-slate-400">Samba AD, шары, OU, DNS и задачи.</p>
        ) : null}
      </div>

      <nav className="space-y-1" aria-label="Основная навигация">
        {navItems.map((item) => {
          const activePath =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              className={[
                "flex items-center gap-3 rounded-xl text-sm transition",
                collapsed ? "justify-center px-2 py-3" : "px-4 py-3",
                activePath
                  ? "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white",
              ].join(" ")}
            >
              <item.Icon className="h-5 w-5 shrink-0 opacity-90" />
              {!collapsed ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className={collapsed ? "mt-6 space-y-2" : "mt-8 space-y-3"}>
        <div
          className={[
            "rounded-2xl border border-slate-800 bg-slate-950/70 text-sm text-slate-400",
            collapsed ? "p-2 text-center" : "p-4",
          ].join(" ")}
        >
          {user ? (
            <>
              {!collapsed ? (
                <>
                  <div className="font-medium text-white">{user.display_name || user.username}</div>
                  <div className="mt-1 text-xs">{user.role}</div>
                  <div className="mt-2 text-xs">
                    Режим: {user.is_pro_mode === true ? "Pro" : "Стандартный"}
                  </div>
                </>
              ) : (
                <span className="sr-only">
                  {user.display_name || user.username}, {user.role}
                </span>
              )}
            </>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          title="Выйти из панели"
          aria-label="Выйти из панели"
          className={[
            "flex w-full items-center gap-3 rounded-xl border border-slate-700 text-sm font-medium text-slate-200 hover:bg-slate-800",
            collapsed ? "justify-center px-2 py-3" : "px-4 py-3",
          ].join(" ")}
        >
          <IconLogout className="h-5 w-5 shrink-0" />
          {!collapsed ? <span>Выйти</span> : null}
        </button>
      </div>
    </aside>
  );
}
