const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  hour12: false,
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${dateFormatter.format(date)} UTC`;
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatMs(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? "—" : `${ms} ms`;
}

export function truncate(text: string, max = 140): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function summarize(value: unknown, max = 160): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return truncate(value, max);
  try {
    return truncate(JSON.stringify(value), max);
  } catch {
    return String(value);
  }
}

const ACTION_LABELS: Record<string, string> = {
  "request.created": "Request created",
  "request.triaged": "Triaged by agent",
  "request.assigned": "Assigned by agent",
  "request.updated": "Updated by People-Ops",
  "request.resolved": "Resolved by People-Ops",
  "agent.failed": "Agent run failed",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
