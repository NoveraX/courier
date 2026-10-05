/**
 * Read a `mock:logs:clear` payload from the UI: the mock whose log the page
 * cleared.
 *
 * @param raw - The payload, `{ serverId: string }`
 * @returns The mock's id, or `undefined` for a payload that is not one
 *
 * @example
 * ```ts
 * const serverId = clearedMockOf({ serverId: "petstore" });
 * if (serverId) mockLog.forget(serverId);
 * ```
 */
export function clearedMockOf(raw: unknown): string | undefined {
  if (raw === null || typeof raw !== "object" || !("serverId" in raw)) return undefined;
  const { serverId } = raw;
  return typeof serverId === "string" && serverId.length > 0 ? serverId : undefined;
}
