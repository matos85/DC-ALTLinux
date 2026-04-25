"use client";

import { useEffect, useState } from "react";

import { AuthGuard } from "@/components/auth-guard";
import { DataCard } from "@/components/data-card";
import { PageTabs } from "@/components/page-tabs";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/components/auth-provider";
import { apiRequest, formatApiError } from "@/lib/client-api";

type Summary = {
  servers: number;
  jobs_total: number;
  jobs_running: number;
  jobs_failed: number;
  audit_events: number;
};

type DirectorySummary = {
  server: {
    id?: number | null;
    name: string;
    slug: string;
    role: string;
  };
  share_templates: number;
  available_modules: string[];
};

const emptySummary: Summary = {
  servers: 0,
  jobs_total: 0,
  jobs_running: 0,
  jobs_failed: 0,
  audit_events: 0,
};

const emptyDirectory: DirectorySummary = {
  server: {
    name: "Не выбран",
    slug: "-",
    role: "-",
  },
  share_templates: 0,
  available_modules: [],
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [directory, setDirectory] = useState<DirectorySummary>(emptyDirectory);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      return;
    }

    async function loadDashboard() {
      try {
        const [summaryData, directoryData] = await Promise.all([
          apiRequest<Summary>("/jobs/summary/"),
          apiRequest<DirectorySummary>("/directory/summary/"),
        ]);
        setSummary(summaryData);
        setDirectory(directoryData);
        setError("");
      } catch (requestError) {
        setError(formatApiError(requestError));
      }
    }

    void loadDashboard();
  }, [user]);

  return (
    <div>
      <PageHeader
        title="Дашборд"
        description="Сводка по панели, домену и задачам. Детали — на вкладке «Домен и модули»."
      />

      <AuthGuard>
        <PageTabs
          defaultId="summary"
          tabs={[
            {
              id: "summary",
              label: "Сводка",
              content: (
                <>
                  {error ? (
                    <div className="mb-6 rounded-xl border border-rose-800/70 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
                      {error}
                    </div>
                  ) : null}

                  <div className="mb-6 grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
                    <DataCard
                      title="Текущий оператор"
                      description="Профиль и режим; смена пароля — в «Настройки»."
                    >
                      {user ? (
                        <dl className="grid gap-3 text-sm text-slate-300">
                          <div className="flex justify-between rounded-xl bg-slate-950 px-4 py-3">
                            <dt>Пользователь</dt>
                            <dd>{user.display_name || user.username}</dd>
                          </div>
                          <div className="flex justify-between rounded-xl bg-slate-950 px-4 py-3">
                            <dt>Роль</dt>
                            <dd>{user.role}</dd>
                          </div>
                          <div className="flex justify-between rounded-xl bg-slate-950 px-4 py-3">
                            <dt>Режим</dt>
                            <dd>{user.is_pro_mode === true ? "Pro" : "Стандартный"}</dd>
                          </div>
                        </dl>
                      ) : null}
                    </DataCard>

                    <DataCard title="Быстрый старт" description="Основные разделы в боковом меню.">
                      <ul className="grid gap-3 text-sm text-slate-300">
                        <li className="rounded-xl bg-slate-950 px-4 py-3">Пользователи и группы.</li>
                        <li className="rounded-xl bg-slate-950 px-4 py-3">Шары и ACL.</li>
                        <li className="rounded-xl bg-slate-950 px-4 py-3">OU, DNS, компьютеры.</li>
                        <li className="rounded-xl bg-slate-950 px-4 py-3">Задачи и аудит.</li>
                      </ul>
                    </DataCard>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <StatCard label="Серверы" value={summary.servers} hint="Подключённые агенты" />
                    <StatCard label="Всего задач" value={summary.jobs_total} hint="История операций" />
                    <StatCard label="В работе" value={summary.jobs_running} hint="Активные задания" />
                    <StatCard label="Ошибки" value={summary.jobs_failed} hint="Статус failed" />
                    <StatCard label="Аудит" value={summary.audit_events} hint="Журнал действий" />
                  </div>
                </>
              ),
            },
            {
              id: "domain",
              label: "Домен и модули",
              content: (
                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <DataCard
                    title="Активный доменный контур"
                    description="Сервер по умолчанию и доступные модули агента."
                  >
                    <dl className="grid gap-3 text-sm text-slate-300">
                      <div className="flex justify-between rounded-xl bg-slate-950 px-4 py-3">
                        <dt>Активный сервер</dt>
                        <dd>{directory.server.name}</dd>
                      </div>
                      <div className="flex justify-between rounded-xl bg-slate-950 px-4 py-3">
                        <dt>Роль</dt>
                        <dd>{directory.server.role}</dd>
                      </div>
                      <div className="flex justify-between rounded-xl bg-slate-950 px-4 py-3">
                        <dt>Шаблоны шар</dt>
                        <dd>{directory.share_templates}</dd>
                      </div>
                      <div className="rounded-xl bg-slate-950 px-4 py-3">
                        <dt className="mb-2">Доступные модули</dt>
                        <dd className="flex flex-wrap gap-2">
                          {directory.available_modules.map((moduleName) => (
                            <span
                              key={moduleName}
                              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300"
                            >
                              {moduleName}
                            </span>
                          ))}
                        </dd>
                      </div>
                    </dl>
                  </DataCard>

                  <DataCard title="Навигация" description="Куда смотреть дальше.">
                    <ul className="grid gap-3 text-sm text-slate-300">
                      <li className="rounded-xl bg-slate-950 px-4 py-3">Учётные записи — «Пользователи», «Группы».</li>
                      <li className="rounded-xl bg-slate-950 px-4 py-3">Файлы — «Шары и ACL».</li>
                      <li className="rounded-xl bg-slate-950 px-4 py-3">Структура AD — «OU», «DNS», «Компьютеры».</li>
                      <li className="rounded-xl bg-slate-950 px-4 py-3">Профиль панели — «Настройки».</li>
                    </ul>
                  </DataCard>
                </div>
              ),
            },
          ]}
        />
      </AuthGuard>
    </div>
  );
}
