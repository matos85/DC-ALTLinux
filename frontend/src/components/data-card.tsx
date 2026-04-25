import { ReactNode } from "react";

type DataCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function DataCard({ title, description, children }: DataCardProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
