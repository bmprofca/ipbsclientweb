"use client";

import { ChangeEvent } from "react";

export type PbxExtensionOption = {
  number: string;
  type?: string;
  status?: string;
  mapped?: Array<{ name?: string }>;
};

function optionLabel(n: string, row?: PbxExtensionOption) {
  const agent = row?.mapped?.map((m) => m.name).filter(Boolean).join(", ");
  return [n, row?.type, row?.status, agent].filter(Boolean).join(" · ");
}

export function ExtensionSelect({
  name,
  defaultValue = "",
  value,
  onChange,
  extensions,
  required,
  allowEmpty = true,
  emptyLabel = "Not mapped",
  loading = false,
  disabled,
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  extensions: PbxExtensionOption[];
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  const selected = value ?? defaultValue;
  const numbers = [
    ...new Set([...extensions.map((e) => e.number).filter(Boolean), selected].filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const bound = onChange
    ? {
        value: selected,
        onChange: (e: ChangeEvent<HTMLSelectElement | HTMLInputElement>) => onChange(e.target.value),
      }
    : { defaultValue: selected };

  if (loading) {
    return (
      <select name={name} disabled value="">
        <option value="">Loading IP-PBX extensions…</option>
      </select>
    );
  }

  if (!extensions.length) {
    return (
      <input
        name={name}
        required={required}
        disabled={disabled}
        placeholder="Must exist on the PBX"
        {...bound}
      />
    );
  }

  return (
    <select name={name} required={required} disabled={disabled} {...bound}>
      {(allowEmpty || !selected) && <option value="">{emptyLabel}</option>}
      {numbers.map((n) => {
        const row = extensions.find((e) => e.number === n);
        return (
          <option key={n} value={n}>
            {optionLabel(n, row)}
          </option>
        );
      })}
    </select>
  );
}
