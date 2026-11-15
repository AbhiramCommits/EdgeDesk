import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "purple";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  title?: string;
}

/** Single rendering primitive for every status, priority, category, and role. */
export function Badge({ tone = "neutral", children, className, title }: BadgeProps) {
  return (
    <span
      className={["badge", `badge--${tone}`, className].filter(Boolean).join(" ")}
      title={title}
    >
      {children}
    </span>
  );
}
