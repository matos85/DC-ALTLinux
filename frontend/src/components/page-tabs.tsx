"use client";

import { ReactNode, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";

export type PageTab = {
  id: string;
  label: string;
  /** Скрывать вкладку, пока у пользователя не включён Pro-режим. */
  proOnly?: boolean;
  content: ReactNode;
};

type PageTabsProps = {
  tabs: PageTab[];
  defaultId?: string;
  className?: string;
};

export function PageTabs({ tabs, defaultId, className = "" }: PageTabsProps) {
  const { user } = useAuth();
  const proEnabled = user?.is_pro_mode === true;

  const visibleTabs = useMemo(
    () => tabs.filter((tab) => !tab.proOnly || proEnabled),
    [tabs, proEnabled],
  );

  const initialId =
    defaultId ?? tabs.find((t) => !t.proOnly)?.id ?? tabs[0]?.id ?? "";
  const [active, setActive] = useState(initialId);

  const resolvedActive = useMemo(() => {
    if (!visibleTabs.length) {
      return "";
    }
    if (visibleTabs.some((t) => t.id === active)) {
      return active;
    }
    return visibleTabs[0].id;
  }, [visibleTabs, active]);

  if (!visibleTabs.length) {
    return null;
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label="Разделы страницы"
        className="mb-6 flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-950/50 p-1"
      >
        {visibleTabs.map((tab) => {
          const selected = resolvedActive === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(tab.id)}
              className={[
                "rounded-lg px-4 py-2 text-sm font-medium transition",
                selected
                  ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="min-h-[12rem]">
        {visibleTabs.find((t) => t.id === resolvedActive)?.content ?? null}
      </div>
    </div>
  );
}
