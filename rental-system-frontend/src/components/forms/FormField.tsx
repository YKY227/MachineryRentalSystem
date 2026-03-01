import type { ReactNode } from "react";
import { FormError } from "./FormError";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  description?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  required,
  description,
  error,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={["space-y-1.5", className].filter(Boolean).join(" ")}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-slate-700"
      >
        {label}{" "}
        {required && <span className="text-red-500">*</span>}
      </label>

      {children}

      {description && !error && (
        <p className="text-[11px] text-slate-500">
          {description}
        </p>
      )}

      <FormError>{error}</FormError>
    </div>
  );
}
