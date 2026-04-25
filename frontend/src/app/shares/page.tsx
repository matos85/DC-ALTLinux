"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataCard } from "@/components/data-card";
import { PageTabs } from "@/components/page-tabs";
import { TableSearch } from "@/components/table-search";
import { ActionButton, Field, Select, StatusMessage, TextArea, TextInput } from "@/components/form-controls";
import { IconButton } from "@/components/icon-button";
import { ClipboardList, Trash2 } from "lucide-react";
import { JsonOperationForm } from "@/components/json-operation-form";
import { PageHeader } from "@/components/page-header";
import { ProModePanel } from "@/components/pro-mode-panel";
import { apiRequest, formatApiError } from "@/lib/client-api";
import { waitForJob } from "@/lib/jobs";
import { extractJobId, splitCommaSeparated } from "@/lib/panel-utils";

type ShareTemplate = {
  id: number;
  name: string;
  path: string;
  description: string;
};

type SharesResponse = {
  templates?: ShareTemplate[];
  live?: { items?: { name: string }[] };
};

type ShareAclResponse = {
  data?: {
    acl?: string[];
  };
};

type ShareAuditConfig = {
  critical_actions?: string[];
  log_reads_enabled?: boolean;
  agent_log_paths?: string[];
  max_lines_default?: number;
  preview_lines_stored?: number;
};

export default function SharesPage() {
  const { user } = useAuth();
  const [shares, setShares] = useState<ShareTemplate[]>([]);
  const [selectedShare, setSelectedShare] = useState("");
  const [aclLines, setAclLines] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const [createState, setCreateState] = useState({
    name: "",
    path: "",
    description: "",
    read_groups: "",
    change_groups: "",
    full_groups: "Domain Admins",
  });
  const [aclState, setAclState] = useState({
    principal: "",
    access: "change",
  });
  const [listQuery, setListQuery] = useState("");
  const [pendingDeleteShare, setPendingDeleteShare] = useState<string | null>(null);
  const [shareAuditConfig, setShareAuditConfig] = useState<ShareAuditConfig | null>(null);

  const filteredShares = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) {
      return shares;
    }
    return shares.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.path.toLowerCase().includes(q) ||
        (item.description || "").toLowerCase().includes(q),
    );
  }, [shares, listQuery]);

  const loadShares = useCallback(async (nextSelectedShare?: string) => {
    const response = await apiRequest<SharesResponse>("/directory/shares/");
    const nextShares = response.templates ?? [];
    setShares(nextShares);
    const selected = nextSelectedShare || selectedShare || nextShares[0]?.name || "";
    setSelectedShare(selected);
    if (selected) {
      const aclResponse = await apiRequest<ShareAclResponse>(
        `/directory/shares/${encodeURIComponent(selected)}/acl/`,
      );
      setAclLines(aclResponse.data?.acl ?? []);
    } else {
      setAclLines([]);
    }
  }, [selectedShare]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void loadShares().catch((error) => {
      setStatus(formatApiError(error));
      setStatusTone("error");
    });
  }, [loadShares, user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    void apiRequest<ShareAuditConfig>("/directory/shares/audit/config/")
      .then((cfg) => setShareAuditConfig(cfg))
      .catch(() => setShareAuditConfig(null));
  }, [user]);

  useEffect(() => {
    if (!user || !selectedShare) {
      return;
    }

    void apiRequest<ShareAclResponse>(`/directory/shares/${encodeURIComponent(selectedShare)}/acl/`)
      .then((response) => {
        setAclLines(response.data?.acl ?? []);
      })
      .catch((error) => {
        setStatus(formatApiError(error));
        setStatusTone("error");
      });
  }, [selectedShare, user]);

  async function runShareAction(
    request: Promise<unknown>,
    successMessage: string,
    nextSelectedShare?: string,
  ) {
    try {
      setStatus("Операция выполняется...");
      setStatusTone("neutral");
      const payload = await request;
      const jobId = extractJobId(payload);
      if (jobId) {
        const job = await waitForJob(jobId);
        if (job.status === "failed") {
          throw job.stderr || "Задание завершилось с ошибкой.";
        }
      }
      await loadShares(nextSelectedShare);
      setStatus(successMessage);
      setStatusTone("success");
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  async function pullSambaLogsFromAgent() {
    try {
      setStatus("Запрос логов у агента на DC…");
      setStatusTone("neutral");
      const res = await apiRequest<{ message?: string; line_counts?: Record<string, number> }>(
        "/directory/shares/audit/agent-pull/",
        { method: "POST", body: {} },
      );
      const parts = res.line_counts
        ? Object.entries(res.line_counts)
            .map(([k, v]) => `${k}: ${v} строк`)
            .join("; ")
        : "";
      setStatus(res.message ? `${res.message} ${parts}` : `Снимок получен. ${parts}`);
      setStatusTone("success");
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  async function handleCreateShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runShareAction(
      apiRequest("/directory/shares/", {
        method: "POST",
        body: {
          name: createState.name,
          path: createState.path,
          description: createState.description,
          read_groups: splitCommaSeparated(createState.read_groups),
          change_groups: splitCommaSeparated(createState.change_groups),
          full_groups: splitCommaSeparated(createState.full_groups),
        },
      }),
      "Шара создана.",
      createState.name,
    );
  }

  return (
    <div>
      <PageHeader
        title="Шары и ACL"
        description="Шары, просмотр ACL, создание и назначение прав — на вкладках."
      />

      <AuthGuard>
        <PageTabs
          key={user?.is_pro_mode === true ? "pro" : "std"}
          defaultId="shares"
          tabs={[
            {
              id: "shares",
              label: "Шары и ACL",
              content: (
                <DataCard title="Сетевые папки" description="Список шар и текст ACL выбранной шары.">
                  {status ? (
                    <div className="mb-4">
                      <StatusMessage message={status} tone={statusTone} />
                    </div>
                  ) : null}
                  <TableSearch value={listQuery} onChange={setListQuery} placeholder="Поиск по имени, пути или описанию…" />
                  <div className="grid gap-3">
                    {filteredShares.map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                          <div>
                            <div className="text-sm font-medium text-white">{item.name}</div>
                            <div className="mt-1 text-xs text-slate-500">{item.path}</div>
                            <div className="mt-1 text-xs text-slate-400">{item.description || "Без описания"}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <IconButton
                              icon={ClipboardList}
                              label="Показать ACL шары"
                              tone="secondary"
                              onClick={() => void loadShares(item.name)}
                            />
                            <IconButton
                              icon={Trash2}
                              label="Удалить шару"
                              tone="danger"
                              onClick={() => setPendingDeleteShare(item.name)}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="mb-3 text-sm font-medium text-white">
                      ACL для {selectedShare || "не выбранной"} шары
                    </div>
                    <TextArea readOnly rows={10} value={aclLines.join("\n")} />
                  </div>
                </DataCard>
              ),
            },
            {
              id: "share-audit",
              label: "Аудит и логи Samba",
              content: (
                <DataCard
                  title="Журнал шар и гибкие настройки"
                  description="Критичные операции (создание, удаление, ACL) сразу пишутся в аудит панели. Полные логи smbd на DC — по кнопке (операция агента samba.share.audit_collect)."
                >
                  {shareAuditConfig ? (
                    <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-xs text-slate-400">
                      <div className="mb-2 font-medium text-slate-300">Текущая политика (env backend)</div>
                      <ul className="list-inside list-disc space-y-1">
                        <li>
                          Критичные действия: {(shareAuditConfig.critical_actions ?? []).join(", ") || "—"}
                        </li>
                        <li>Логировать чтение списка/ACL: {shareAuditConfig.log_reads_enabled ? "да" : "нет"}</li>
                        <li>Пути логов для агента (по умолчанию):</li>
                      </ul>
                      <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/50 p-2 text-[11px] text-slate-500">
                        {(shareAuditConfig.agent_log_paths ?? []).join("\n")}
                      </pre>
                      <div className="mt-2 text-slate-500">
                        max_lines={shareAuditConfig.max_lines_default}, в БД preview до{" "}
                        {shareAuditConfig.preview_lines_stored} строк на файл
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 text-xs text-slate-500">Настройки недоступны (роль или сервер).</div>
                  )}
                  <ActionButton type="button" onClick={() => void pullSambaLogsFromAgent()}>
                    Загрузить хвосты логов с агента (DC)
                  </ActionButton>
                  <p className="mt-3 text-xs text-slate-500">
                    Событие с источником <code className="text-slate-400">agent</code> появится в разделе «Задачи и аудит»
                    → фильтр «Только шары». Полный текст логов — в ответе API (сеть), в БД хранится усечённый preview.
                  </p>
                </DataCard>
              ),
            },
            {
              id: "create",
              label: "Создание и права",
              content: (
                <div className="grid gap-6 xl:grid-cols-2">
                  <DataCard title="Создать шару" description="Папка, описание и группы доступа.">
                    <form className="grid gap-4" onSubmit={(event) => void handleCreateShare(event)}>
                      <Field label="Имя шары">
                        <TextInput
                          value={createState.name}
                          onChange={(event) => setCreateState((current) => ({ ...current, name: event.target.value }))}
                          placeholder="finance"
                        />
                      </Field>
                      <Field label="Путь папки">
                        <TextInput
                          value={createState.path}
                          onChange={(event) => setCreateState((current) => ({ ...current, path: event.target.value }))}
                          placeholder="/srv/samba/finance"
                        />
                      </Field>
                      <Field label="Описание">
                        <TextInput
                          value={createState.description}
                          onChange={(event) =>
                            setCreateState((current) => ({ ...current, description: event.target.value }))
                          }
                          placeholder="Документы финансового отдела"
                        />
                      </Field>
                      <Field label="Только чтение" hint="Через запятую.">
                        <TextInput
                          value={createState.read_groups}
                          onChange={(event) =>
                            setCreateState((current) => ({ ...current, read_groups: event.target.value }))
                          }
                          placeholder="Finance_Read"
                        />
                      </Field>
                      <Field label="Изменение" hint="Через запятую.">
                        <TextInput
                          value={createState.change_groups}
                          onChange={(event) =>
                            setCreateState((current) => ({ ...current, change_groups: event.target.value }))
                          }
                          placeholder="Group_Read, domain\\user"
                        />
                      </Field>
                      <Field label="Полный доступ" hint="Часто Domain Admins.">
                        <TextInput
                          value={createState.full_groups}
                          onChange={(event) =>
                            setCreateState((current) => ({ ...current, full_groups: event.target.value }))
                          }
                        />
                      </Field>
                      <ActionButton type="submit">Создать шару</ActionButton>
                    </form>
                  </DataCard>

                  <DataCard title="Назначить права" description="Обновление ACL выбранной шары.">
                    <form
                      className="grid gap-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void runShareAction(
                          apiRequest(`/directory/shares/${encodeURIComponent(selectedShare)}/acl/`, {
                            method: "POST",
                            body: aclState,
                          }),
                          "ACL обновлён.",
                          selectedShare,
                        );
                      }}
                    >
                      <Field label="Шара">
                        <Select value={selectedShare} onChange={(event) => setSelectedShare(event.target.value)}>
                          {shares.map((item) => (
                            <option key={item.name} value={item.name}>
                              {item.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Пользователь или группа">
                        <TextInput
                          value={aclState.principal}
                          onChange={(event) => setAclState((current) => ({ ...current, principal: event.target.value }))}
                          placeholder="Group_RW или domain\\user"
                        />
                      </Field>
                      <Field label="Уровень доступа">
                        <Select
                          value={aclState.access}
                          onChange={(event) => setAclState((current) => ({ ...current, access: event.target.value }))}
                        >
                          <option value="read">Только чтение</option>
                          <option value="change">Изменение</option>
                          <option value="full">Полный доступ</option>
                        </Select>
                      </Field>
                      <ActionButton type="submit" disabled={!selectedShare || !aclState.principal}>
                        Применить ACL
                      </ActionButton>
                    </form>
                  </DataCard>
                </div>
              ),
            },
            {
              id: "pro",
              label: "Pro (JSON)",
              proOnly: true,
              content: (
                <ProModePanel title="Pro: JSON по шарам" description="Прямые запросы к API.">
                  <div className="grid gap-6">
                    <JsonOperationForm
                      endpoint="/directory/shares/"
                      title="Создать шару через API"
                      description="Полный payload."
                      initialPayload={{
                        name: "",
                        path: "",
                        description: "",
                        read_groups: [] as string[],
                        change_groups: [] as string[],
                        full_groups: [] as string[],
                      }}
                    />
                    <JsonOperationForm
                      endpoint="/directory/shares/example-share/acl/"
                      title="ACL через API"
                      description="Ручной payload."
                      initialPayload={{ principal: "", access: "read" }}
                    />
                  </div>
                </ProModePanel>
              ),
            },
          ]}
        />

        <ConfirmDialog
          open={pendingDeleteShare !== null}
          title="Удалить шару?"
          message={
            pendingDeleteShare
              ? `Шара «${pendingDeleteShare}» будет удалена с сервера Samba. Убедитесь, что данные сохранены.`
              : ""
          }
          confirmLabel="Удалить"
          onCancel={() => setPendingDeleteShare(null)}
          onConfirm={() => {
            const name = pendingDeleteShare;
            setPendingDeleteShare(null);
            if (name) {
              void runShareAction(
                apiRequest(`/directory/shares/${encodeURIComponent(name)}/`, { method: "DELETE" }),
                "Шара удалена.",
              );
            }
          }}
        />
      </AuthGuard>
    </div>
  );
}
