export function nowIso(): string {
  return new Date().toISOString();
}

export function addHoursIso(baseIso: string, hours: number): string {
  return new Date(Date.parse(baseIso) + hours * 3_600_000).toISOString();
}

export function isPast(iso: string | null, now = Date.now()): boolean {
  return iso !== null && Date.parse(iso) < now;
}
