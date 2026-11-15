/** UUID v4 identifiers for every D1 row and session. */
export function newId(): string {
  return crypto.randomUUID();
}
