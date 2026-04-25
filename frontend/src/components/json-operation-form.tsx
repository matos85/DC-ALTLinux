"use client";

import { FormEvent, useState } from "react";
import { Play } from "lucide-react";

import { apiRequest, formatApiError } from "@/lib/client-api";

type JsonOperationFormProps = {
  endpoint: string;
  method?: "POST" | "PATCH" | "DELETE";
  title: string;
  description: string;
  initialPayload: Record<string, unknown>;
};

export function JsonOperationForm({
  endpoint,
  method = "POST",
  title,
  description,
  initialPayload,
}: JsonOperationFormProps) {
  const [payload, setPayload] = useState(JSON.stringify(initialPayload, null, 2));
  const [result, setResult] = useState("Здесь появится ответ API.");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult("Отправка запроса...");

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setResult("JSON невалиден.");
      return;
    }

    try {
      const data = await apiRequest<unknown>(endpoint, {
        method,
        body: parsed,
      });
      setResult(JSON.stringify(data, null, 2));
    } catch (error) {
      setResult(formatApiError(error));
    }
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      <textarea
        value={payload}
        onChange={(event) => setPayload(event.target.value)}
        rows={10}
        className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-xs text-slate-200"
      />
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-medium text-slate-950 hover:bg-sky-400"
      >
        <Play className="size-4 shrink-0" strokeWidth={2} aria-hidden />
        Выполнить
      </button>
      <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300">
        {result}
      </pre>
    </form>
  );
}
