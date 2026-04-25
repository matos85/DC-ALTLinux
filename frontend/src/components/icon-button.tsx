"use client";

import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  /** Подсказка и доступность */
  label: string;
  tone?: "primary" | "secondary" | "danger";
};

export function IconButton({
  icon: Icon,
  label,
  tone = "secondary",
  type = "button",
  className = "",
  ...props
}: IconButtonProps) {
  const toneClassName =
    tone === "danger"
      ? "bg-rose-600/90 text-white hover:bg-rose-500"
      : tone === "secondary"
        ? "border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
        : "bg-sky-500 text-slate-950 hover:bg-sky-400";

  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      {...props}
      className={[
        "inline-flex size-11 shrink-0 items-center justify-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-60",
        toneClassName,
        className,
      ]
        .join(" ")
        .trim()}
    >
      <Icon className="size-5" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
