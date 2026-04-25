"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataCard } from "@/components/data-card";
import { PageTabs } from "@/components/page-tabs";
import { TableSearch } from "@/components/table-search";
import { ActionButton, Field, Select, StatusMessage, TextArea, TextInput } from "@/components/form-controls";
import { IconButton } from "@/components/icon-button";
import { Activity, Trash2 } from "lucide-react";
import { JsonOperationForm } from "@/components/json-operation-form";
import { PageHeader } from "@/components/page-header";
import { ProModePanel } from "@/components/pro-mode-panel";
import { apiRequest, formatApiError } from "@/lib/client-api";

type Server = {
  id: number;
  name: string;
  role: string;
  base_url: string;
  is_active: boolean;
  is_default: boolean;
  last_seen_at?: string | null;
};

type ServerResponse = {
  results?: Server[];
};

type AgentInstallInfo = {
  public_base_url: string;
  bundle_url: string;
  join_workstation_script_url: string;
  provision_dc_script_url: string;
  curl_download_and_install: string;
  curl_join_workstation: string;
  curl_provision_dc: string;
  token_configured: boolean;
  steps: string[];
};

export default function ServersPage() {
  const { user } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const [formState, setFormState] = useState({
    name: "",
    base_url: "",
    role: "primary_dc",
    shared_secret: "change-me-agent-secret",
  });
  const [listQuery, setListQuery] = useState("");
  const [pendingDeleteServer, setPendingDeleteServer] = useState<{ id: number; name: string } | null>(null);
  const [agentInstall, setAgentInstall] = useState<AgentInstallInfo | null>(null);
  const [agentInstallError, setAgentInstallError] = useState("");

  const filteredServers = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) {
      return servers;
    }
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.base_url.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q),
    );
  }, [servers, listQuery]);

  async function loadServers() {
    try {
      const response = await apiRequest<ServerResponse>("/jobs/servers/");
      setServers(response.results ?? []);
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  useEffect(() => {
    if (user) {
      const timer = window.setTimeout(() => {
        void loadServers();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    async function loadInstallInfo() {
      try {
        const data = await apiRequest<AgentInstallInfo>("/agent/install-info/");
        setAgentInstall(data);
        setAgentInstallError("");
      } catch (error) {
        setAgentInstall(null);
        setAgentInstallError(formatApiError(error));
      }
    }
    void loadInstallInfo();
  }, [user]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setStatus("Регистрирую сервер...");
      setStatusTone("neutral");
      await apiRequest("/jobs/servers/", {
        method: "POST",
        body: {
          ...formState,
          is_active: true,
          is_default: false,
          capabilities: {
            users: true,
            groups: true,
            shares: true,
            acl: true,
            computers: true,
            ou: true,
            dns: true,
          },
        },
      });
      await loadServers();
      setStatus("Сервер зарегистрирован.");
      setStatusTone("success");
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  async function handleHealth(serverId: number) {
    try {
      setStatus("Проверяю состояние агента...");
      setStatusTone("neutral");
      await apiRequest(`/jobs/servers/${serverId}/health/`, { method: "POST" });
      await loadServers();
      setStatus("Проверка агента завершена.");
      setStatusTone("success");
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  async function handleDelete(serverId: number) {
    try {
      setStatus("Удаляю запись сервера...");
      setStatusTone("neutral");
      await apiRequest(`/jobs/servers/${serverId}/`, { method: "DELETE" });
      await loadServers();
      setStatus("Запись сервера удалена.");
      setStatusTone("success");
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  return (
    <div>
      <PageHeader
        title="Серверы и агенты"
        description="Реестр подключенных доменных серверов и локальных domain-agent endpoint без ручного JSON."
      />

      <AuthGuard>
        <PageTabs
          key={user?.is_pro_mode === true ? "pro" : "std"}
          defaultId="install"
          tabs={[
            {
              id: "install",
              label: "Установка агента",
              content: (
                <div className="grid gap-6">
                  {agentInstallError ? (
                    <div>
                      <StatusMessage message={agentInstallError} tone="error" />
                    </div>
                  ) : null}
                  <DataCard
                    title="Развёртывание домена Samba AD на сервере (DC)"
                    description="Только на новой установке ALT, от root. Интерактивно: пакеты, samba-tool domain provision, запуск samba-ad-dc."
                  >
                    {agentInstall ? (
                      <div className="grid gap-4 text-sm text-slate-300">
                        <Field label="Скачать и запустить (на сервере DC)">
                          <TextArea
                            readOnly
                            rows={3}
                            value={agentInstall.curl_provision_dc}
                            className="font-mono text-xs"
                          />
                        </Field>
                        <Field label="Только скачать">
                          <TextArea
                            readOnly
                            rows={2}
                            value={`curl -fsSL '${agentInstall.provision_dc_script_url}' -o provision-dc.sh`}
                            className="font-mono text-xs"
                          />
                        </Field>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Загрузка подсказок…</p>
                    )}
                  </DataCard>

                  <DataCard
                    title="Ввод рабочей станции в домен (скрипт)"
                    description="Скачайте на ПК пользователя, запускайте не от root. Скрипт задаст вопросы и предложит realm join или net ads join."
                  >
                    {agentInstall ? (
                      <div className="grid gap-4 text-sm text-slate-300">
                        <Field label="Скачать и запустить (curl + chmod + запуск)">
                          <TextArea
                            readOnly
                            rows={3}
                            value={agentInstall.curl_join_workstation}
                            className="font-mono text-xs"
                          />
                        </Field>
                        <Field label="Только скачать">
                          <TextArea
                            readOnly
                            rows={2}
                            value={`curl -fsSL '${agentInstall.join_workstation_script_url}' -o join-workstation.sh`}
                            className="font-mono text-xs"
                          />
                        </Field>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Загрузка подсказок…</p>
                    )}
                  </DataCard>

                  <DataCard
                    title="Скачать и поставить агент на Linux (ALT)"
                    description="Агент ставится на хост с Samba AD / инструментами samba-tool (обычно контроллер домена или рядом с ним), не на каждую рабочую станцию."
                  >
                    {agentInstall ? (
                      <div className="grid gap-4 text-sm text-slate-300">
                        <p className="text-slate-400">
                          Команда для целевой машины (подставлены URL и токен с сервера панели). Нужны{" "}
                          <code className="text-slate-200">curl</code> и{" "}
                          <code className="text-slate-200">tar</code>.
                        </p>
                        <Field label="Одной строкой: скачать архив и запустить установку">
                          <TextArea
                            readOnly
                            rows={3}
                            value={agentInstall.curl_download_and_install}
                            className="font-mono text-xs"
                          />
                        </Field>
                        <Field label="Только скачать архив">
                          <TextArea readOnly rows={2} value={`curl -fsSL '${agentInstall.bundle_url}' -o domain-agent.tgz`} className="font-mono text-xs" />
                        </Field>
                        <ol className="list-decimal space-y-2 pl-5 text-slate-400">
                          {agentInstall.steps.map((step, index) => (
                            <li key={index}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Загрузка подсказок…</p>
                    )}
                  </DataCard>
                </div>
              ),
            },
            {
              id: "list",
              label: "Серверы",
              content: (
                <DataCard title="Подключенные endpoints" description="Агенты домена.">
                  {status ? (
                    <div className="mb-4">
                      <StatusMessage message={status} tone={statusTone} />
                    </div>
                  ) : null}
                  <TableSearch value={listQuery} onChange={setListQuery} placeholder="Поиск по имени, URL или роли…" />
                  <div className="grid gap-3">
                    {filteredServers.map((server) => (
                      <div key={server.id} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                          <div>
                            <div className="text-sm font-medium text-white">{server.name}</div>
                            <div className="mt-1 text-xs text-slate-500">{server.base_url}</div>
                            <div className="mt-1 text-xs text-slate-400">
                              {server.role} · {server.is_default ? "по умолчанию" : "не по умолчанию"}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <IconButton
                              icon={Activity}
                              label="Проверить доступность агента (health-check)"
                              tone="secondary"
                              onClick={() => void handleHealth(server.id)}
                            />
                            <IconButton
                              icon={Trash2}
                              label="Удалить сервер"
                              tone="danger"
                              onClick={() => setPendingDeleteServer({ id: server.id, name: server.name })}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </DataCard>
              ),
            },
            {
              id: "add",
              label: "Добавить",
              content: (
                <DataCard title="Новый сервер" description="Регистрация агента на хосте.">
                  <form className="grid gap-4" onSubmit={(event) => void handleCreate(event)}>
                    <Field label="Название">
                      <TextInput
                        value={formState.name}
                        onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                        placeholder="ServerDC2"
                      />
                    </Field>
                    <Field label="URL агента">
                      <TextInput
                        value={formState.base_url}
                        onChange={(event) => setFormState((current) => ({ ...current, base_url: event.target.value }))}
                        placeholder="http://serverdc2:8090"
                      />
                    </Field>
                    <Field label="Роль">
                      <Select
                        value={formState.role}
                        onChange={(event) => setFormState((current) => ({ ...current, role: event.target.value }))}
                      >
                        <option value="primary_dc">Primary DC</option>
                        <option value="backup_dc">Backup DC</option>
                        <option value="file_server">File server</option>
                        <option value="hybrid">Hybrid</option>
                      </Select>
                    </Field>
                    <Field label="Shared secret">
                      <TextInput
                        value={formState.shared_secret}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, shared_secret: event.target.value }))
                        }
                      />
                    </Field>
                    <ActionButton type="submit">Добавить сервер</ActionButton>
                  </form>
                </DataCard>
              ),
            },
            {
              id: "pro",
              label: "Pro (JSON)",
              proOnly: true,
              content: (
                <ProModePanel title="Pro: серверы через API" description="Регистрация endpoint вручную.">
                  <JsonOperationForm
                    endpoint="/jobs/servers/"
                    title="Регистрация сервера"
                    description="Payload создания записи."
                    initialPayload={{
                      name: "",
                      base_url: "",
                      role: "primary_dc",
                      shared_secret: "",
                      is_active: true,
                      is_default: false,
                      capabilities: {
                        dns: true,
                        shares: true,
                        acl: true,
                      },
                    }}
                  />
                </ProModePanel>
              ),
            },
          ]}
        />

        <ConfirmDialog
          open={pendingDeleteServer !== null}
          title="Удалить запись сервера?"
          message={
            pendingDeleteServer
              ? `Запись «${pendingDeleteServer.name}» будет удалена из панели. Агент на хосте останется, но панель перестанет к нему обращаться.`
              : ""
          }
          confirmLabel="Удалить"
          onCancel={() => setPendingDeleteServer(null)}
          onConfirm={() => {
            const target = pendingDeleteServer;
            setPendingDeleteServer(null);
            if (target) {
              void handleDelete(target.id);
            }
          }}
        />
      </AuthGuard>
    </div>
  );
}
