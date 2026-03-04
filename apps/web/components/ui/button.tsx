import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: "ui-btn-primary",
  secondary: "ui-btn-secondary",
  ghost: "ui-btn-ghost",
  danger: "ui-btn-danger"
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "ui-btn-sm",
  md: "ui-btn-md",
  lg: "ui-btn-lg"
};

export function Button({ className, variant = "primary", size = "md", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn("ui-btn", variantClass[variant], sizeClass[size], className)} {...props} />;
}
