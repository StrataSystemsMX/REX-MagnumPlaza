"use client";

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EnumSelectProps<T extends string> {
  values: ReadonlyArray<T>;
  labelFor: (value: T) => string;
  value?: T;
  onValueChange?: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
  triggerSize?: "sm" | "default";
  id?: string;
  name?: string;
}

export function EnumSelect<T extends string>({
  values,
  labelFor,
  value,
  onValueChange,
  placeholder,
  disabled,
  triggerClassName = "w-full",
  triggerSize,
  id,
  name,
}: EnumSelectProps<T>) {
  const items = useMemo<Record<string, string>>(
    () => Object.fromEntries(values.map((v) => [v, labelFor(v)])),
    [values, labelFor],
  );

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === null) return;
        onValueChange?.(v as T);
      }}
      items={items}
      disabled={disabled}
      name={name}
    >
      <SelectTrigger id={id} size={triggerSize} className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {values.map((v) => (
          <SelectItem key={v} value={v}>
            {labelFor(v)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
