"use client";

import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const fieldClassName =
  "w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500";

type FieldProps = {
  label: string;
  hint?: string;
  children: ReactNode;
};

export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="grid gap-2 text-sm text-slate-300">
      <span className="font-medium text-slate-200">{label}</span>
      {children}
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={[fieldClassName, props.className ?? ""].join(" ").trim()} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={[fieldClassName, props.className ?? ""].join(" ").trim()} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={[fieldClassName, props.className ?? ""].join(" ").trim()} />;
}

export function ActionButton({
  children,
  tone = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "danger";
}) {
  const toneClassName =
    tone === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-500"
      : tone === "secondary"
        ? "border border-slate-700 text-slate-200 hover:bg-slate-800"
        : "bg-sky-500 text-slate-950 hover:bg-sky-400";

  return (
    <button
      {...props}
      className={[
        "rounded-xl px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        toneClassName,
        props.className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {children}
    </button>
  );
}

export function StatusMessage({
  message,
  tone = "neutral",
}: {
  message: string;
  tone?: "neutral" | "success" | "error";
}) {
  const toneClassName =
    tone === "success"
      ? "border-emerald-800/70 bg-emerald-950/30 text-emerald-200"
      : tone === "error"
        ? "border-rose-800/70 bg-rose-950/30 text-rose-200"
        : "border-slate-800 bg-slate-950 text-slate-300";

  return <div className={`rounded-xl border px-4 py-3 text-sm ${toneClassName}`}>{message}</div>;
}
