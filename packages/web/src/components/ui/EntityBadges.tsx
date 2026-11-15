import { Badge } from "./Badge";
import { BADGE_VARIANTS } from "./badgeVariants";
import type { RequestCategory, RequestPriority, RequestStatus, UserRole } from "shared";

export function StatusBadge({ status }: { status: RequestStatus }) {
  const variant = BADGE_VARIANTS.status[status];
  return <Badge tone={variant.tone}>{variant.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: RequestPriority }) {
  const variant = BADGE_VARIANTS.priority[priority];
  return <Badge tone={variant.tone}>{variant.label}</Badge>;
}

export function CategoryBadge({ category }: { category: RequestCategory | null }) {
  if (!category) return <Badge tone="neutral">Untriaged</Badge>;
  const variant = BADGE_VARIANTS.category[category];
  return <Badge tone={variant.tone}>{variant.label}</Badge>;
}

export function RoleBadge({ role }: { role: UserRole }) {
  const variant = BADGE_VARIANTS.role[role];
  return <Badge tone={variant.tone}>{variant.label}</Badge>;
}
