"use client";

import { TextInput } from "@/components/form-controls";

type TableSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function TableSearch({ value, onChange, placeholder = "Поиск по списку…" }: TableSearchProps) {
  return (
    <div className="mb-4">
      <TextInput
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Поиск по таблице"
      />
    </div>
  );
}
