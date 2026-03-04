import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type AlertVariant = "info" | "success" | "error";

const variantClass: Record<AlertVariant, string> = {
  info: "ui-alert-info",
  success: "ui-alert-success",
  error: "ui-alert-error"
};

export function Alert({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant }) {
  const { variant = "info", ...rest } = props;
  return (
    <div className={cn("ui-alert", variantClass[variant], className)} role="status" {...rest}>
      {children}
    </div>
  );
}
