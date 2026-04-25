"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataCard } from "@/components/data-card";
import { PageTabs } from "@/components/page-tabs";
import { TableSearch } from "@/components/table-search";
import { ActionButton, Field, Select, StatusMessage, TextInput } from "@/components/form-controls";
import { IconButton } from "@/components/icon-button";
import { Ban, KeyRound, Trash2, UserCheck } from "lucide-react";
import { JsonOperationForm } from "@/components/json-operation-form";
import { PageHeader } from "@/components/page-header";
import { ProModePanel } from "@/components/pro-mode-panel";
import { apiRequest, formatApiError } from "@/lib/client-api";
import { waitForJob } from "@/lib/jobs";
import { createPassword, extractJobId, parseFullName, splitCommaSeparated } from "@/lib/panel-utils";

type UsersResponse = {
  data?: { items?: { username: string }[] };
  items?: { username: string }[];
};

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<{ username: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const [createState, setCreateState] = useState({
    username: "",
    fullName: "",
    email: "",
    password: createPassword(),
    groups: "",
  });
  const [resetPassword, setResetPassword] = useState(createPassword());
  const [listQuery, setListQuery] = useState("");
  const [pendingDeleteUser, setPendingDeleteUser] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) {
      return users;
    }
    return users.filter((item) => item.username.toLowerCase().includes(q));
  }, [users, listQuery]);

  async function loadUsers() {
    try {
      const response = await apiRequest<UsersResponse>("/directory/users/");
      const nextUsers = response.items ?? response.data?.items ?? [];
      setUsers(nextUsers);
      setSelectedUser((current) => current || nextUsers[0]?.username || "");
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  useEffect(() => {
    if (user) {
      void loadUsers();
    }
  }, [user]);

  async function runUserAction(endpoint: string, body: Record<string, unknown> = {}) {
    try {
      setStatus("Операция выполняется...");
      setStatusTone("neutral");
      const payload = await apiRequest<unknown>(endpoint, { method: "POST", body });
      const jobId = extractJobId(payload);
      if (jobId) {
        const job = await waitForJob(jobId);
        if (job.status === "failed") {
          throw job.stderr || "Задание завершилось с ошибкой.";
        }
      }
      await loadUsers();
      setStatus("Операция выполнена.");
      setStatusTone("success");
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { firstName, lastName } = parseFullName(createState.fullName);
    await runUserAction("/directory/users/", {
      username: createState.username,
      password: createState.password,
      first_name: firstName,
      last_name: lastName,
      email: createState.email,
      groups: splitCommaSeparated(createState.groups),
    });
  }

  return (
    <div>
      <PageHeader
        title="Пользователи домена"
        description="Список, создание и сброс пароля — на вкладках. Pro-режим для произвольного JSON."
      />

      <AuthGuard>
        <PageTabs
          key={user?.is_pro_mode === true ? "pro" : "std"}
          defaultId="list"
          tabs={[
            {
              id: "list",
              label: "Список и действия",
              content: (
                <DataCard title="Пользователи" description="Включение, блокировка, удаление. Поиск по имени.">
                  {status ? (
                    <div className="mb-4">
                      <StatusMessage message={status} tone={statusTone} />
                    </div>
                  ) : null}
                  <TableSearch value={listQuery} onChange={setListQuery} placeholder="Фильтр по имени пользователя…" />
                  <div className="grid gap-3">
                    {filteredUsers.map((item) => (
                      <div key={item.username} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                          <div>
                            <div className="text-sm font-medium text-white">{item.username}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <IconButton
                              icon={UserCheck}
                              label="Включить учётную запись"
                              tone="secondary"
                              onClick={() =>
                                void runUserAction(
                                  `/directory/users/${encodeURIComponent(item.username)}/enable/`,
                                )
                              }
                            />
                            <IconButton
                              icon={Ban}
                              label="Заблокировать учётную запись"
                              tone="secondary"
                              onClick={() =>
                                void runUserAction(
                                  `/directory/users/${encodeURIComponent(item.username)}/disable/`,
                                )
                              }
                            />
                            <IconButton
                              icon={Trash2}
                              label="Удалить пользователя"
                              tone="danger"
                              onClick={() => setPendingDeleteUser(item.username)}
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
              id: "create",
              label: "Создание и пароль",
              content: (
                <div className="grid gap-6 xl:grid-cols-2">
                  <DataCard title="Создать пользователя" description="Логин, ФИО, email, группы через запятую.">
                    <form className="grid gap-4" onSubmit={(event) => void handleCreateUser(event)}>
                      <Field label="Логин">
                        <TextInput
                          value={createState.username}
                          onChange={(event) => setCreateState((current) => ({ ...current, username: event.target.value }))}
                          placeholder="ivan.petrov"
                        />
                      </Field>
                      <Field label="ФИО">
                        <TextInput
                          value={createState.fullName}
                          onChange={(event) => setCreateState((current) => ({ ...current, fullName: event.target.value }))}
                          placeholder="Иван Петров"
                        />
                      </Field>
                      <Field label="Email">
                        <TextInput
                          type="email"
                          value={createState.email}
                          onChange={(event) => setCreateState((current) => ({ ...current, email: event.target.value }))}
                          placeholder="user@example.com"
                        />
                      </Field>
                      <Field label="Начальный пароль">
                        <div className="flex gap-2">
                          <TextInput
                            value={createState.password}
                            onChange={(event) => setCreateState((current) => ({ ...current, password: event.target.value }))}
                          />
                          <IconButton
                            icon={KeyRound}
                            label="Сгенерировать пароль"
                            tone="secondary"
                            onClick={() => setCreateState((current) => ({ ...current, password: createPassword() }))}
                          />
                        </div>
                      </Field>
                      <Field label="Группы" hint="Необязательно, через запятую.">
                        <TextInput
                          value={createState.groups}
                          onChange={(event) => setCreateState((current) => ({ ...current, groups: event.target.value }))}
                        />
                      </Field>
                      <ActionButton type="submit">Создать пользователя</ActionButton>
                    </form>
                  </DataCard>

                  <DataCard title="Сброс пароля" description="Выбор пользователя и новый пароль.">
                    <form
                      className="grid gap-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void runUserAction(
                          `/directory/users/${encodeURIComponent(selectedUser)}/reset-password/`,
                          {
                            password: resetPassword,
                          },
                        );
                      }}
                    >
                      <Field label="Пользователь">
                        <Select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)}>
                          {users.map((u) => (
                            <option key={u.username} value={u.username}>
                              {u.username}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Новый пароль">
                        <div className="flex gap-2">
                          <TextInput value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} />
                          <IconButton
                            icon={KeyRound}
                            label="Сгенерировать пароль"
                            tone="secondary"
                            onClick={() => setResetPassword(createPassword())}
                          />
                        </div>
                      </Field>
                      <ActionButton type="submit" disabled={!selectedUser}>
                        Сбросить пароль
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
                <ProModePanel
                  title="Pro: JSON-операции по пользователям"
                  description="Произвольные запросы к API панели."
                >
                  <div className="grid gap-6">
                    <JsonOperationForm
                      endpoint="/directory/users/"
                      title="Создать пользователя через API"
                      description="Полный payload."
                      initialPayload={{
                        username: "",
                        password: "",
                        first_name: "",
                        last_name: "",
                        email: "",
                        groups: [] as string[],
                      }}
                    />
                    <JsonOperationForm
                      endpoint="/directory/users/example/disable/"
                      title="Операция над пользователем"
                      description="Для enable/delete/reset-password меняется endpoint."
                      initialPayload={{ dry_run: true }}
                    />
                  </div>
                </ProModePanel>
              ),
            },
          ]}
        />

        <ConfirmDialog
          open={pendingDeleteUser !== null}
          title="Удалить пользователя домена?"
          message={
            pendingDeleteUser
              ? `Будет запрошено удаление учётной записи «${pendingDeleteUser}». Операция необратима в рамках домена.`
              : ""
          }
          confirmLabel="Удалить"
          onCancel={() => setPendingDeleteUser(null)}
          onConfirm={() => {
            const username = pendingDeleteUser;
            setPendingDeleteUser(null);
            if (username) {
              void runUserAction(`/directory/users/${encodeURIComponent(username)}/delete/`);
            }
          }}
        />
      </AuthGuard>
    </div>
  );
}
