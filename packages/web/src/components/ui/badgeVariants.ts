import type { RequestCategory, RequestPriority, RequestStatus, UserRole } from "shared";
import type { BadgeTone } from "./Badge";

export interface BadgeVariant {
  label: string;
  tone: BadgeTone;
}

/**
 * The one map the whole UI uses for status/priority/category/role badges.
 * Adding a new enum member without a variant is a TypeScript error.
 */
export const BADGE_VARIANTS: {
  status: Record<RequestStatus, BadgeVariant>;
  priority: Record<RequestPriority, BadgeVariant>;
  category: Record<RequestCategory, BadgeVariant>;
  role: Record<UserRole, BadgeVariant>;
} = {
  status: {
    new: { label: "New", tone: "info" },
    triaging: { label: "Triaging", tone: "warning" },
    awaiting_info: { label: "Awaiting info", tone: "warning" },
    in_progress: { label: "In progress", tone: "purple" },
    resolved: { label: "Resolved", tone: "success" },
    rejected: { label: "Rejected", tone: "neutral" },
  },
  priority: {
    p0: { label: "P0 · Critical", tone: "danger" },
    p1: { label: "P1 · High", tone: "warning" },
    p2: { label: "P2 · Normal", tone: "info" },
    p3: { label: "P3 · Low", tone: "neutral" },
  },
  category: {
    equipment: { label: "Equipment", tone: "purple" },
    onboarding: { label: "Onboarding", tone: "success" },
    policy: { label: "Policy", tone: "info" },
    access: { label: "Access", tone: "warning" },
    payroll: { label: "Payroll", tone: "danger" },
    other: { label: "Other", tone: "neutral" },
  },
  role: {
    employee: { label: "Employee", tone: "neutral" },
    people_ops: { label: "People-Ops", tone: "purple" },
    admin: { label: "Admin", tone: "danger" },
  },
};
