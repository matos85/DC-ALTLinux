"use client";

import { ReactNode } from "react";

import { DataCard } from "@/components/data-card";
import { useAuth } from "@/components/auth-provider";

type ProModePanelProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function ProModePanel({ title, description, children }: ProModePanelProps) {
  const { user } = useAuth();

  if (user?.is_pro_mode !== true) {
    return null;
  }

  return (
    <DataCard title={title} description={description}>
      {children}
    </DataCard>
  );
}
