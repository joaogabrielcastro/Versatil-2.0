"use client";

import { Input } from "@/components/ui/input";
import {
  maskDateBrInput,
  maskDateTimeBrInput,
  normalizeDateBrInput,
} from "@/lib/dates/br";

type BrDateInputProps = {
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function BrDateInput({
  value,
  onChange,
  withTime = false,
  placeholder,
  required,
  disabled,
  className,
  id,
}: BrDateInputProps) {
  function handleChange(raw: string) {
    onChange(withTime ? maskDateTimeBrInput(raw) : maskDateBrInput(raw));
  }

  function handleBlur() {
    if (!value.trim()) return;
    const normalized = normalizeDateBrInput(value, withTime);
    if (normalized !== value) onChange(normalized);
  }

  return (
    <Input
      id={id}
      className={className}
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      placeholder={placeholder ?? (withTime ? "dd/mm/aaaa HH:mm" : "dd/mm/aaaa")}
      inputMode="numeric"
      maxLength={withTime ? 16 : 10}
      required={required}
      disabled={disabled}
      autoComplete="off"
    />
  );
}
