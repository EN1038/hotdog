"use client";

import { formatThaiPhone, phoneDigits } from "@/lib/constants";

type PhoneInputProps = {
  value: string;
  onChange: (digits: string) => void;
  id?: string;
  name?: string;
  className?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** max digits (default 10 for Thai mobile) */
  maxDigits?: number;
};

export function PhoneInput({
  value,
  onChange,
  id,
  name,
  className = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400",
  placeholder = "081-234-5678",
  required,
  disabled,
  autoFocus,
  maxDigits = 10,
}: PhoneInputProps) {
  return (
    <input
      id={id}
      name={name}
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      className={className}
      value={formatThaiPhone(value)}
      onChange={(e) => onChange(phoneDigits(e.target.value, maxDigits))}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      autoFocus={autoFocus}
      maxLength={12} // 081-234-5678
    />
  );
}
