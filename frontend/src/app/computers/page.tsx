"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataCard } from "@/components/data-card";
import { PageTabs } from "@/components/page-tabs";
import { TableSearch } from "@/components/table-search";
import { ActionButton, Field, StatusMessage, TextArea, TextInput } from "@/components/form-controls";
import { IconButton } from "@/components/icon-button";
import { Terminal, Trash2 } from "lucide-react";
import { JsonOperationForm } from "@/components/json-operation-form";
import { PageHeader } from "@/components/page-header";
import { ProModePanel } from "@/components/pro-mode-panel";
import { apiRequest, formatApiError } from "@/lib/client-api";
import { waitForJob } from "@/lib/jobs";
import { extractJobId } from "@/lib/panel-utils";

type ComputersResponse = {
  data?: { items?: { hostname: string }[] };
  items?: { hostname: string }[];
};

type JoinResponse = {
  data?: {
    script?: string;
  };
};

export default function ComputersPage() {
  const { user } = useAuth();
  const [computers, setComputers] = useState<{ hostname: string }[]>([]);
  const [joinForm, setJoinForm] = useState({
    hostname: "",
    domain_dns: "",
    primary_dc_ip: "",
    admin_user: "",
  });
  const [joinScript, setJoinScript] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const [listQuery, setListQuery] = useState("");
  const [pendingDeleteHost, setPendingDeleteHost] = useState<string | null>(null);

  const filteredComputers = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) {
      return computers;
    }
    return computers.filter((item) => item.hostname.toLowerCase().includes(q));
  }, [computers, listQuery]);

  async function loadComputers() {
    try {
      const response = await apiRequest<ComputersResponse>("/directory/computers/");
      setComputers(response.items ?? response.data?.items ?? []);
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  useEffect(() => {
    if (user) {
      void loadComputers();
    }
  }, [user]);

  async function handleDelete(hostname: string) {
    try {
      setStatus("Удаляю компьютерный объект...");
      setStatusTone("neutral");
      const payload = await apiRequest<unknown>("/directory/computers/", {
        method: "POST",
        body: { hostname },
      });
      const jobId = extractJobId(payload);
      if (jobId) {
        const job = await waitForJob(jobId);
        if (job.status === "failed") {
          throw job.stderr || "Задание завершилось с ошибкой.";
        }
      }
      await loadComputers();
      setStatus("Компьютерный объект удалён.");
      setStatusTone("success");
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  async function handleGenerateJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setStatus("Генерирую join-сценарий...");
      setStatusTone("neutral");
      const response = await apiRequest<JoinResponse>("/directory/join-command/", {
        method: "POST",
        body: joinForm,
      });
      setJoinScript(response.data?.script ?? "");
      setStatus("Сценарий готов.");
      setStatusTone("success");
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  return (
    <div>
      <PageHeader
        title="Компьютеры домена"
        description="Просмотр компьютерных объектов, удаление записей и генерация готовой команды ввода рабочей станции в домен."
      />

      <AuthGuard>
        <PageTabs
          key={user?.is_pro_mode === true ? "pro" : "std"}
          defaultId="list"
          tabs={[
            {
              id: "list",
              label: "Компьютеры",
              content: (
                <DataCard title="Компьютерные объекты" description="Машины в домене.">
                  {status ? (
                    <div className="mb-4">
                      <StatusMessage message={status} tone={statusTone} />
                    </div>
                  ) : null}
                  <TableSearch value={listQuery} onChange={setListQuery} placeholder="Фильтр по имени компьютера…" />
                  <div className="grid gap-3">
                    {filteredComputers.map((item) => (
                      <div key={item.hostname} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="text-sm font-medium text-white">{item.hostname}</div>
                          <IconButton
                            icon={Trash2}
                            label="Удалить компьютерный объект"
                            tone="danger"
                            onClick={() => setPendingDeleteHost(item.hostname)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </DataCard>
              ),
            },
            {
              id: "join",
              label: "Ввод в домен",
              content: (
                <DataCard title="Команда ввода в домен" description="Сценарий для администратора рабочей станции.">
                  <form className="grid gap-4" onSubmit={(event) => void handleGenerateJoin(event)}>
                    <Field label="Имя компьютера">
                      <TextInput
                        value={joinForm.hostname}
                        onChange={(event) => setJoinForm((current) => ({ ...current, hostname: event.target.value }))}
                        placeholder="ws3"
                      />
                    </Field>
                    <Field label="DNS-домен">
                      <TextInput
                        value={joinForm.domain_dns}
                        onChange={(event) => setJoinForm((current) => ({ ...current, domain_dns: event.target.value }))}
                        placeholder="corp.example.com"
                      />
                    </Field>
                    <Field label="IP основного DC">
                      <TextInput
                        value={joinForm.primary_dc_ip}
                        onChange={(event) =>
                          setJoinForm((current) => ({ ...current, primary_dc_ip: event.target.value }))
                        }
                        placeholder="10.0.0.1"
                      />
                    </Field>
                    <Field label="Учётная запись администратора домена">
                      <TextInput
                        value={joinForm.admin_user}
                        onChange={(event) => setJoinForm((current) => ({ ...current, admin_user: event.target.value }))}
                        placeholder="Administrator"
                      />
                    </Field>
                    <ActionButton type="submit" className="inline-flex items-center justify-center gap-2">
                      <Terminal className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                      Сгенерировать команду
                    </ActionButton>
                  </form>
                  <div className="mt-4">
                    <Field label="Результат">
                      <TextArea readOnly rows={8} value={joinScript} />
                    </Field>
                  </div>
                </DataCard>
              ),
            },
            {
              id: "pro",
              label: "Pro (JSON)",
              proOnly: true,
              content: (
                <ProModePanel title="Pro: JSON по компьютерам" description="Join и удаление через API.">
                  <div className="grid gap-6">
                    <JsonOperationForm
                      endpoint="/directory/join-command/"
                      title="Join через API"
                      description="Полный запрос."
                      initialPayload={{
                        hostname: "",
                        domain_dns: "",
                        primary_dc_ip: "",
                        admin_user: "",
                      }}
                    />
                    <JsonOperationForm
                      endpoint="/directory/computers/"
                      title="Удалить компьютер через API"
                      description="Удаление объекта домена."
                      initialPayload={{ hostname: "", dry_run: true }}
                    />
                  </div>
                </ProModePanel>
              ),
            },
          ]}
        />

        <ConfirmDialog
          open={pendingDeleteHost !== null}
          title="Удалить компьютерный объект?"
          message={
            pendingDeleteHost
              ? `Объект «${pendingDeleteHost}» будет удалён из Active Directory. Рабочая станция останется вне домена до повторного ввода.`
              : ""
          }
          confirmLabel="Удалить"
          onCancel={() => setPendingDeleteHost(null)}
          onConfirm={() => {
            const host = pendingDeleteHost;
            setPendingDeleteHost(null);
            if (host) {
              void handleDelete(host);
            }
          }}
        />
      </AuthGuard>
    </div>
  );
}
