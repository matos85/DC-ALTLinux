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
import { ChevronDown, ChevronRight, Trash2, UserMinus, UserPlus } from "lucide-react";
import { JsonOperationForm } from "@/components/json-operation-form";
import { PageHeader } from "@/components/page-header";
import { ProModePanel } from "@/components/pro-mode-panel";
import { apiRequest, formatApiError } from "@/lib/client-api";
import { waitForJob } from "@/lib/jobs";
import { extractJobId } from "@/lib/panel-utils";

type GroupsResponse = {
  data?: { items?: { name: string }[] };
  items?: { name: string }[];
};

type UsersResponse = {
  data?: { items?: { username: string }[] };
  items?: { username: string }[];
};

type GroupMembersResponse = {
  group: string;
  members: { username: string }[];
};

type MembersEntry = {
  loading: boolean;
  error?: string;
  list: { username: string }[];
};

export default function GroupsPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<{ name: string }[]>([]);
  const [users, setUsers] = useState<{ username: string }[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [memberUser, setMemberUser] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const [listQuery, setListQuery] = useState("");
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [membersByGroup, setMembersByGroup] = useState<Record<string, MembersEntry>>({});

  const filteredGroups = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) {
      return groups;
    }
    return groups.filter((item) => item.name.toLowerCase().includes(q));
  }, [groups, listQuery]);

  async function loadData() {
    try {
      const [groupResponse, userResponse] = await Promise.all([
        apiRequest<GroupsResponse>("/directory/groups/"),
        apiRequest<UsersResponse>("/directory/users/"),
      ]);
      const nextGroups = groupResponse.items ?? groupResponse.data?.items ?? [];
      const nextUsers = userResponse.items ?? userResponse.data?.items ?? [];
      setGroups(nextGroups);
      setUsers(nextUsers);
      setSelectedGroup((current) => current || nextGroups[0]?.name || "");
      setMemberUser((current) => current || nextUsers[0]?.username || "");
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  useEffect(() => {
    if (user) {
      void loadData();
    }
  }, [user]);

  async function loadGroupMembers(name: string) {
    setMembersByGroup((prev) => ({
      ...prev,
      [name]: { loading: true, list: prev[name]?.list ?? [] },
    }));
    try {
      const res = await apiRequest<GroupMembersResponse>(
        `/directory/groups/${encodeURIComponent(name)}/members/`,
      );
      setMembersByGroup((prev) => ({
        ...prev,
        [name]: { loading: false, list: res.members ?? [] },
      }));
    } catch (error) {
      setMembersByGroup((prev) => ({
        ...prev,
        [name]: {
          loading: false,
          list: [],
          error: formatApiError(error),
        },
      }));
    }
  }

  function toggleGroupExpanded(name: string) {
    if (expandedGroup === name) {
      setExpandedGroup(null);
      return;
    }
    setExpandedGroup(name);
    const existing = membersByGroup[name];
    if (!existing || (!existing.loading && !existing.list.length && !existing.error)) {
      void loadGroupMembers(name);
    }
  }

  async function runGroupAction(endpoint: string, body: Record<string, unknown> = {}) {
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
      await loadData();
      if (expandedGroup) {
        void loadGroupMembers(expandedGroup);
      }
      setStatus("Операция выполнена.");
      setStatusTone("success");
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runGroupAction("/directory/groups/", {
      name: groupName,
      description: groupDescription,
    });
    setGroupName("");
    setGroupDescription("");
  }

  return (
    <div>
      <PageHeader
        title="Группы"
        description="Состав групп, создание и управление участниками. Раздел разбит на вкладки."
      />

      <AuthGuard>
        <PageTabs
          key={user?.is_pro_mode === true ? "pro" : "std"}
          defaultId="list"
          tabs={[
            {
              id: "list",
              label: "Группы и состав",
              content: (
                <DataCard
                  title="Список групп"
                  description="Разверните строку, чтобы загрузить участников с контроллера домена (samba-tool group listmembers)."
                >
                  {status ? (
                    <div className="mb-4">
                      <StatusMessage message={status} tone={statusTone} />
                    </div>
                  ) : null}
                  <TableSearch value={listQuery} onChange={setListQuery} placeholder="Фильтр по имени группы…" />
                  <div className="grid gap-2">
                    {filteredGroups.map((item) => {
                      const open = expandedGroup === item.name;
                      const mem = membersByGroup[item.name];
                      return (
                        <div key={item.name} className="rounded-xl border border-slate-800 bg-slate-950">
                          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleGroupExpanded(item.name)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                                aria-expanded={open}
                              >
                                {open ? (
                                  <ChevronDown className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
                                ) : (
                                  <ChevronRight className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
                                )}
                                Состав
                              </button>
                              <span className="truncate text-sm font-medium text-white">{item.name}</span>
                            </div>
                            <IconButton
                              icon={Trash2}
                              label="Удалить группу"
                              tone="danger"
                              onClick={() => setPendingDeleteGroup(item.name)}
                            />
                          </div>
                          {open ? (
                            <div className="border-t border-slate-800 px-4 py-3 text-sm text-slate-300">
                              {mem?.loading ? (
                                <p className="text-slate-500">Загрузка состава…</p>
                              ) : mem?.error ? (
                                <p className="text-rose-300">{mem.error}</p>
                              ) : mem && mem.list.length === 0 ? (
                                <p className="text-slate-500">В группе нет участников (или список пуст).</p>
                              ) : (
                                <ul className="grid gap-1">
                                  {mem?.list.map((m) => (
                                    <li key={m.username} className="rounded-lg bg-slate-900/80 px-3 py-2 font-mono text-xs">
                                      {m.username}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </DataCard>
              ),
            },
            {
              id: "manage",
              label: "Создание и участники",
              content: (
                <div className="grid gap-6 xl:grid-cols-2">
                  <DataCard title="Создать группу" description="Новая группа безопасности в домене.">
                    <form className="grid gap-4" onSubmit={(event) => void handleCreateGroup(event)}>
                      <Field label="Название группы">
                        <TextInput
                          value={groupName}
                          onChange={(event) => setGroupName(event.target.value)}
                          placeholder="Finance_RW"
                        />
                      </Field>
                      <Field label="Описание">
                        <TextInput
                          value={groupDescription}
                          onChange={(event) => setGroupDescription(event.target.value)}
                          placeholder="Доступ на изменение для финансового отдела"
                        />
                      </Field>
                      <ActionButton type="submit">Создать группу</ActionButton>
                    </form>
                  </DataCard>

                  <DataCard title="Участники" description="Добавить или убрать пользователя в выбранной группе.">
                    <div className="grid gap-4">
                      <Field label="Группа">
                        <Select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)}>
                          {groups.map((g) => (
                            <option key={g.name} value={g.name}>
                              {g.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Пользователь">
                        <Select value={memberUser} onChange={(event) => setMemberUser(event.target.value)}>
                          {users.map((u) => (
                            <option key={u.username} value={u.username}>
                              {u.username}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <div className="flex flex-wrap gap-2">
                        <IconButton
                          icon={UserPlus}
                          label="Добавить пользователя в группу"
                          tone="primary"
                          onClick={() =>
                            void runGroupAction(`/directory/groups/${encodeURIComponent(selectedGroup)}/add-member/`, {
                              username: memberUser,
                            })
                          }
                          disabled={!selectedGroup || !memberUser}
                        />
                        <IconButton
                          icon={UserMinus}
                          label="Удалить пользователя из группы"
                          tone="secondary"
                          onClick={() =>
                            void runGroupAction(`/directory/groups/${encodeURIComponent(selectedGroup)}/remove-member/`, {
                              username: memberUser,
                            })
                          }
                          disabled={!selectedGroup || !memberUser}
                        />
                      </div>
                    </div>
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
                  title="Pro: JSON-операции по группам"
                  description="Ручной режим API для нестандартных сценариев."
                >
                  <div className="grid gap-6">
                    <JsonOperationForm
                      endpoint="/directory/groups/"
                      title="Создание группы через API"
                      description="Исходный payload для backend."
                      initialPayload={{ name: "", description: "", dry_run: true }}
                    />
                    <JsonOperationForm
                      endpoint="/directory/groups/example-group/add-member/"
                      title="Добавление участника через API"
                      description="Для удаления смените endpoint на remove-member."
                      initialPayload={{ username: "", dry_run: true }}
                    />
                  </div>
                </ProModePanel>
              ),
            },
          ]}
        />

        <ConfirmDialog
          open={pendingDeleteGroup !== null}
          title="Удалить группу?"
          message={
            pendingDeleteGroup
              ? `Группа «${pendingDeleteGroup}» будет удалена из домена. Участники потеряют связанные с ней права.`
              : ""
          }
          confirmLabel="Удалить"
          onCancel={() => setPendingDeleteGroup(null)}
          onConfirm={() => {
            const name = pendingDeleteGroup;
            setPendingDeleteGroup(null);
            if (name) {
              void runGroupAction(`/directory/groups/${encodeURIComponent(name)}/delete/`);
            }
          }}
        />
      </AuthGuard>
    </div>
  );
}
