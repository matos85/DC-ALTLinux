"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataCard } from "@/components/data-card";
import { PageTabs } from "@/components/page-tabs";
import { TableSearch } from "@/components/table-search";
import { ActionButton, Field, StatusMessage, TextInput } from "@/components/form-controls";
import { IconButton } from "@/components/icon-button";
import { RefreshCw, Trash2 } from "lucide-react";
import { JsonOperationForm } from "@/components/json-operation-form";
import { PageHeader } from "@/components/page-header";
import { ProModePanel } from "@/components/pro-mode-panel";
import { apiRequest, formatApiError } from "@/lib/client-api";
import { waitForJob } from "@/lib/jobs";
import { extractJobId } from "@/lib/panel-utils";

type DnsResponse = {
  data?: { zone?: string; records?: string[] };
  zone?: string;
  records?: string[];
};

function dnsListFromApi(response: DnsResponse): { zone: string; records: string[] } {
  const zone = response.data?.zone ?? response.zone ?? "";
  const raw = response.data?.records ?? response.records;
  const records = Array.isArray(raw) ? raw : [];
  return { zone, records };
}

function parseDnsLine(line: string) {
  const nameMatch = line.match(/^Name=(.+?),/);
  const recordMatch = line.match(/^(A|AAAA|CNAME|TXT|NS|MX):\s+(.+)$/);
  return {
    name: nameMatch?.[1] ?? "",
    recordType: recordMatch?.[1] ?? "",
    value: recordMatch?.[2] ?? "",
  };
}

export default function DnsPage() {
  const { user } = useAuth();
  const [zone, setZone] = useState("");
  const [records, setRecords] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const [createState, setCreateState] = useState({
    zone: "",
    name: "",
    record_type: "A",
    value: "",
  });
  const [listQuery, setListQuery] = useState("");
  const [pendingDnsDelete, setPendingDnsDelete] = useState<{
    name: string;
    recordType: string;
    value: string;
  } | null>(null);

  const loadRecords = useCallback(async (targetZone = zone) => {
    try {
      const response = await apiRequest<DnsResponse>(`/directory/dns/records/?zone=${encodeURIComponent(targetZone)}`);
      const { zone: z, records: list } = dnsListFromApi(response);
      setZone(z || targetZone);
      setCreateState((current) => ({ ...current, zone: z || targetZone }));
      setRecords(list);
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }, [zone]);

  useEffect(() => {
    if (user) {
      void loadRecords("");
    }
  }, [loadRecords, user]);

  async function runDnsAction(endpoint: string, body: Record<string, unknown>, successMessage: string) {
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
      await loadRecords(String(body.zone || zone));
      setStatus(successMessage);
      setStatusTone("success");
    } catch (error) {
      setStatus(formatApiError(error));
      setStatusTone("error");
    }
  }

  const parsedRecords = useMemo(() => {
    const result: { line: string; name: string; recordType: string; value: string }[] = [];
    let currentName = "";
    for (const line of records) {
      const parsed = parseDnsLine(line);
      if (line.startsWith("Name=") && parsed.name) {
        currentName = parsed.name === "" ? "@" : parsed.name;
      } else if (parsed.recordType && currentName) {
        result.push({
          line,
          name: currentName,
          recordType: parsed.recordType,
          value: parsed.value.split(" (flags=")[0].trim(),
        });
      }
    }
    return result;
  }, [records]);

  const filteredParsedRecords = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) {
      return parsedRecords;
    }
    return parsedRecords.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.recordType.toLowerCase().includes(q) ||
        item.value.toLowerCase().includes(q),
    );
  }, [parsedRecords, listQuery]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runDnsAction("/directory/dns/records/", createState, "DNS-запись создана.");
  }

  return (
    <div>
      <PageHeader
        title="DNS"
        description="Панель запрашивает зону на контроллере домена (Samba DNS). Если у рабочих станций в DHCP указан DNS роутера, настройте на роутере условную пересылку доменной зоны на IP DC или статические записи для AD — иначе присоединение к домену и SRV-записи не найдутся. Редактирование зоны здесь всё равно идёт на DC (см. AGENT_DNS_SERVER / AGENT_PRIMARY_DC_IP у агента)."
      />

      <AuthGuard>
        <PageTabs
          key={user?.is_pro_mode === true ? "pro" : "std"}
          defaultId="zone"
          tabs={[
            {
              id: "zone",
              label: "Зона",
              content: (
                <DataCard title={`Зона ${zone}`} description="Записи DNS в выбранной зоне.">
                  {status ? (
                    <div className="mb-4">
                      <StatusMessage message={status} tone={statusTone} />
                    </div>
                  ) : null}
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <TextInput className="min-w-[12rem] flex-1" value={zone} onChange={(event) => setZone(event.target.value)} />
                    <IconButton
                      icon={RefreshCw}
                      label="Обновить список записей зоны"
                      tone="secondary"
                      onClick={() => void loadRecords(zone)}
                    />
                  </div>
                  <TableSearch value={listQuery} onChange={setListQuery} placeholder="Фильтр по имени, типу или значению…" />
                  <div className="grid gap-3">
                    {filteredParsedRecords.map((item) => (
                      <div
                        key={`${item.name}-${item.recordType}-${item.value}`}
                        className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-4"
                      >
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                          <div className="font-mono text-xs text-slate-300">
                            {item.name} {item.recordType} {item.value}
                          </div>
                          <IconButton
                            icon={Trash2}
                            label="Удалить DNS-запись"
                            tone="danger"
                            onClick={() =>
                              setPendingDnsDelete({
                                name: item.name === "@" ? "@" : item.name,
                                recordType: item.recordType,
                                value: item.value,
                              })
                            }
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
                <DataCard title="Создать DNS-запись" description="Типы A, CNAME, TXT и др.">
                  <form className="grid gap-4" onSubmit={(event) => void handleCreate(event)}>
                    <Field label="Зона">
                      <TextInput
                        value={createState.zone}
                        onChange={(event) => setCreateState((current) => ({ ...current, zone: event.target.value }))}
                      />
                    </Field>
                    <Field label="Имя записи">
                      <TextInput
                        value={createState.name}
                        onChange={(event) => setCreateState((current) => ({ ...current, name: event.target.value }))}
                        placeholder="ws3"
                      />
                    </Field>
                    <Field label="Тип записи">
                      <TextInput
                        value={createState.record_type}
                        onChange={(event) =>
                          setCreateState((current) => ({ ...current, record_type: event.target.value.toUpperCase() }))
                        }
                        placeholder="A"
                      />
                    </Field>
                    <Field label="Значение">
                      <TextInput
                        value={createState.value}
                        onChange={(event) => setCreateState((current) => ({ ...current, value: event.target.value }))}
                        placeholder="10.0.0.10"
                      />
                    </Field>
                    <ActionButton type="submit">Создать запись</ActionButton>
                  </form>
                </DataCard>
              ),
            },
            {
              id: "pro",
              label: "Pro (JSON)",
              proOnly: true,
              content: (
                <ProModePanel title="Pro: DNS через API" description="Создание и удаление записей.">
                  <div className="grid gap-6">
                    <JsonOperationForm
                      endpoint="/directory/dns/records/"
                      title="Создать запись"
                      description="Payload."
                      initialPayload={{
                        zone: "",
                        name: "",
                        record_type: "A",
                        value: "",
                      }}
                    />
                    <JsonOperationForm
                      endpoint="/directory/dns/records/?action=delete"
                      title="Удалить запись"
                      description="Payload удаления."
                      initialPayload={{
                        zone: "",
                        name: "",
                        record_type: "A",
                        value: "",
                      }}
                    />
                  </div>
                </ProModePanel>
              ),
            },
          ]}
        />

        <ConfirmDialog
          open={pendingDnsDelete !== null}
          title="Удалить DNS-запись?"
          message={
            pendingDnsDelete
              ? `Зона ${zone}: ${pendingDnsDelete.name} ${pendingDnsDelete.recordType} → ${pendingDnsDelete.value}`
              : ""
          }
          confirmLabel="Удалить запись"
          onCancel={() => setPendingDnsDelete(null)}
          onConfirm={() => {
            const row = pendingDnsDelete;
            setPendingDnsDelete(null);
            if (row) {
              void runDnsAction(
                "/directory/dns/records/?action=delete",
                {
                  zone,
                  name: row.name,
                  record_type: row.recordType,
                  value: row.value,
                },
                "DNS-запись удалена.",
              );
            }
          }}
        />
      </AuthGuard>
    </div>
  );
}
