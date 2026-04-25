"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataCard } from "@/components/data-card";
import { PageTabs } from "@/components/page-tabs";
import { TableSearch } from "@/components/table-search";
import { ActionButton, Field, StatusMessage, TextInput } from "@/components/form-controls";
import { IconButton } from "@/components/icon-button";
import { Trash2 } from "lucide-react";
import { JsonOperationForm } from "@/components/json-operation-form";
import { PageHeader } from "@/components/page-header";
import { ProModePanel } from "@/components/pro-mode-panel";
import { apiRequest, formatApiError } from "@/lib/client-api";
import { waitForJob } from "@/lib/jobs";
import { extractJobId } from "@/lib/panel-utils";

type OusResponse = {
  data?: { items?: { distinguished_name: string }[] };
  items?: { distinguished_name: string }[];
};

export default function OusPage() {
  const { user } = useAuth();
  const [ous, setOus] = useState<{ distinguished_name: string }[]>([]);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const [createState, setCreateState] = useState({
    name: "",
    base_dn: "DC=test,DC=alt",
  });
  const [listQuery, setListQuery] = useState("");
  const [pendingDeleteOu, setPendingDeleteOu] = useState<string | null>(null);

  const filteredOus = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) {
      return ous;
    }
    return ous.filter((item) => item.distinguished_name.toLowerCase().includes(q));
  }, [ous, listQuery]);

  async function loadOus() {
    try {
      const response = await apiRequest<OusResponse>("/directory/ous/");
      setOus(response.items ?? response.data?.items ?? []);
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  useEffect(() => {
    if (user) {
      void loadOus();
    }
  }, [user]);

  async function runOuAction(endpoint: string, body: Record<string, unknown>) {
    try {
      setStatus("Операция выполняется...");
      setStatusTone("neutral");
      const payload = await apiRequest<unknown>(endpoint, {
        method: "POST",
        body,
      });
      const jobId = extractJobId(payload);
      if (jobId) {
        const job = await waitForJob(jobId);
        if (job.status === "failed") {
          throw job.stderr || "Задание завершилось с ошибкой.";
        }
      }
      await loadOus();
      setStatus("Операция выполнена.");
      setStatusTone("success");
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runOuAction("/directory/ous/", createState);
    setCreateState((current) => ({ ...current, name: "" }));
  }

  return (
    <div>
      <PageHeader
        title="OU"
        description="Структура домена по организационным единицам без ручного редактирования JSON."
      />

      <AuthGuard>
        <PageTabs
          key={user?.is_pro_mode === true ? "pro" : "std"}
          defaultId="list"
          tabs={[
            {
              id: "list",
              label: "Список OU",
              content: (
                <DataCard title="Текущие OU" description="Организационные единицы домена.">
                  {status ? (
                    <div className="mb-4">
                      <StatusMessage message={status} tone={statusTone} />
                    </div>
                  ) : null}
                  <TableSearch value={listQuery} onChange={setListQuery} placeholder="Фильтр по distinguishedName…" />
                  <div className="grid gap-3">
                    {filteredOus.map((item) => (
                      <div
                        key={item.distinguished_name}
                        className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-4"
                      >
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                          <div className="font-mono text-xs text-slate-300">{item.distinguished_name}</div>
                          <IconButton
                            icon={Trash2}
                            label="Удалить OU"
                            tone="danger"
                            onClick={() => setPendingDeleteOu(item.distinguished_name)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </DataCard>
              ),
            },
            {
              id: "create",
              label: "Создание",
              content: (
                <DataCard title="Создать OU" description="Имя и базовый DN.">
                  <form className="grid gap-4" onSubmit={(event) => void handleCreate(event)}>
                    <Field label="Имя OU">
                      <TextInput
                        value={createState.name}
                        onChange={(event) => setCreateState((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Workstations"
                      />
                    </Field>
                    <Field label="Базовый DN">
                      <TextInput
                        value={createState.base_dn}
                        onChange={(event) => setCreateState((current) => ({ ...current, base_dn: event.target.value }))}
                      />
                    </Field>
                    <ActionButton type="submit">Создать OU</ActionButton>
                  </form>
                </DataCard>
              ),
            },
            {
              id: "pro",
              label: "Pro (JSON)",
              proOnly: true,
              content: (
                <ProModePanel title="Pro: OU через API" description="Создание и удаление вручную.">
                  <div className="grid gap-6">
                    <JsonOperationForm
                      endpoint="/directory/ous/"
                      title="Создать OU"
                      description="Payload создания."
                      initialPayload={{ name: "", base_dn: "", dry_run: true }}
                    />
                    <JsonOperationForm
                      endpoint="/directory/ous/?action=delete"
                      title="Удалить OU"
                      description="По полному DN."
                      initialPayload={{ distinguished_name: "", dry_run: true }}
                    />
                  </div>
                </ProModePanel>
              ),
            },
          ]}
        />

        <ConfirmDialog
          open={pendingDeleteOu !== null}
          title="Удалить OU?"
          message={
            pendingDeleteOu
              ? `Будет удалена OU «${pendingDeleteOu}». Убедитесь, что в ней нет нужных объектов.`
              : ""
          }
          confirmLabel="Удалить OU"
          onCancel={() => setPendingDeleteOu(null)}
          onConfirm={() => {
            const dn = pendingDeleteOu;
            setPendingDeleteOu(null);
            if (dn) {
              void runOuAction("/directory/ous/?action=delete", { distinguished_name: dn });
            }
          }}
        />
      </AuthGuard>
    </div>
  );
}
