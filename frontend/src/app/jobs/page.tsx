"use client";

import { useEffect, useState } from "react";

import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { DataCard } from "@/components/data-card";
import { PageTabs } from "@/components/page-tabs";
import { StatusMessage } from "@/components/form-controls";
import { IconButton } from "@/components/icon-button";
import { RotateCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { apiRequest, formatApiError } from "@/lib/client-api";

type Job = {
  id: number;
  operation: string;
  target_name: string;
  status: string;
  created_at?: string;
};

type AuditEvent = {
  id: number;
  username_snapshot: string;
  actor_name?: string;
  action: string;
  status: string;
  created_at: string;
  category?: string;
  severity?: string;
  source?: string;
  target_type?: string;
  target_id?: string;
  metadata?: Record<string, unknown>;
};

type JobResponse = { results?: Job[] };
type AuditResponse = { results?: AuditEvent[] };

export default function JobsPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [auditScope, setAuditScope] = useState<"all" | "share">("all");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");

  async function loadData() {
    try {
      const auditQuery =
        auditScope === "share" ? "/audit/?category=share&ordering=-created_at" : "/audit/?ordering=-created_at";
      const [jobsResponse, auditResponse] = await Promise.all([
        apiRequest<JobResponse>("/jobs/"),
        apiRequest<AuditResponse>(auditQuery),
      ]);
      setJobs(jobsResponse.results ?? []);
      setAudit(auditResponse.results ?? []);
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  useEffect(() => {
    if (!user) {
      return;
    }
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, auditScope]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const intervalId = window.setInterval(() => void loadData(), 4000);
    return () => window.clearInterval(intervalId);
  }, [user, auditScope]);

  async function retryJob(jobId: number) {
    try {
      setStatus("Повторяю задачу...");
      setStatusTone("neutral");
      await apiRequest(`/jobs/${jobId}/retry/`, { method: "POST" });
      await loadData();
      setStatus("Повтор задачи поставлен в очередь.");
      setStatusTone("success");
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  return (
    <div>
      <PageHeader
        title="Задачи и аудит"
        description="Очередь Celery, повтор задач и журнал: критичные операции с шарами попадают в аудит сразу при запросе (фаза requested), завершение — отдельной записью."
      />

      <AuthGuard>
        <>
          {status ? (
            <div className="mb-6">
              <StatusMessage message={status} tone={statusTone} />
            </div>
          ) : null}
          <PageTabs
            defaultId="jobs"
            tabs={[
              {
                id: "jobs",
                label: "Очередь задач",
                content: (
                  <DataCard
                    title="Задачи"
                    description="Фоновые операции backend и агента. Обновление каждые 4 с на этой странице."
                  >
                    <div className="grid gap-3">
                      {jobs.map((job) => (
                        <div
                          key={job.id}
                          className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-4 text-sm text-slate-300"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-medium text-white">{job.operation}</span>
                            <span className="rounded-full border border-slate-700 px-2 py-1 text-xs">{job.status}</span>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">{job.target_name || "no target"}</div>
                          {job.status === "failed" ? (
                            <div className="mt-3">
                              <IconButton
                                icon={RotateCw}
                                label="Повторить задание"
                                tone="secondary"
                                onClick={() => void retryJob(job.id)}
                              />
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </DataCard>
                ),
              },
              {
                id: "audit",
                label: "Аудит",
                content: (
                  <DataCard
                    title="События аудита"
                    description="Фильтр «Только шары» — создание, удаление, ACL, чтение списка/ACL (если включено), снимки логов с агента."
                  >
                    <div className="mb-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setAuditScope("all")}
                        className={`rounded-lg border px-3 py-1.5 text-xs ${
                          auditScope === "all"
                            ? "border-emerald-600 bg-emerald-950/40 text-emerald-200"
                            : "border-slate-700 text-slate-400"
                        }`}
                      >
                        Все события
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditScope("share")}
                        className={`rounded-lg border px-3 py-1.5 text-xs ${
                          auditScope === "share"
                            ? "border-emerald-600 bg-emerald-950/40 text-emerald-200"
                            : "border-slate-700 text-slate-400"
                        }`}
                      >
                        Только шары
                      </button>
                    </div>
                    <div className="grid gap-3">
                      {audit.map((event) => (
                        <div
                          key={event.id}
                          className={`rounded-xl border px-4 py-4 text-sm ${
                            event.severity === "critical"
                              ? "border-rose-900/80 bg-rose-950/20 text-slate-200"
                              : "border-slate-800 bg-slate-950 text-slate-300"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-white">{event.action}</span>
                            <div className="flex flex-wrap gap-2">
                              {event.severity === "critical" ? (
                                <span className="rounded-full border border-rose-700 bg-rose-950/50 px-2 py-0.5 text-xs text-rose-200">
                                  критично
                                </span>
                              ) : null}
                              {event.category ? (
                                <span className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-400">
                                  {event.category}
                                </span>
                              ) : null}
                              {event.source ? (
                                <span className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-500">
                                  {event.source}
                                </span>
                              ) : null}
                              <span className="rounded-full border border-slate-700 px-2 py-1 text-xs">{event.status}</span>
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            {(event.actor_name || event.username_snapshot || "—") +
                              (event.target_id ? ` · ${event.target_id}` : "")}{" "}
                            · {event.created_at}
                          </div>
                          {event.metadata && Object.keys(event.metadata).length > 0 ? (
                            <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-black/40 p-2 text-[10px] leading-relaxed text-slate-500">
                              {JSON.stringify(event.metadata, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </DataCard>
                ),
              },
            ]}
          />
        </>
      </AuthGuard>
    </div>
  );
}
