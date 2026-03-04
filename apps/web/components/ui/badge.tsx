import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type BadgeVariant = "accent" | "muted" | "success" | "danger";

const variantClass: Record<BadgeVariant, string> = {
  accent: "ui-badge-accent",
  muted: "ui-badge-muted",
  success: "ui-badge-success",
  danger: "ui-badge-danger"
};

export function Badge({ className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  const { variant = "accent", ...rest } = props;
  return (
    <span className={cn("ui-badge", variantClass[variant], className)} {...rest}>
      {children}
    </span>
  );
}
