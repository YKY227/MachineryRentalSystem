import type { ReactNode } from "react";

interface FormErrorProps {
  children?: ReactNode;
}

export function FormError({ children }: FormErrorProps) {
  if (!children) return null;
  return (
    <p className="mt-0.5 text-[11px] text-red-500">
      {children}
    </p>
  );
}
