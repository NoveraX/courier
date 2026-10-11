/**
 * The protocol revisions a client names on every request, in its `_meta`,
 * with no handshake before them.
 */
export const MODERN_VERSIONS = ["2026-07-28"] as const;

/** The revisions a client opens with `initialize`, newest first. */
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;

export type ModernVersion = (typeof MODERN_VERSIONS)[number];
export type LegacyVersion = (typeof LEGACY_VERSIONS)[number];

/** The `_meta` keys the protocol reserves for what a request and a result say about their sender. */
export const META = {
  protocolVersion: "io.modelcontextprotocol/protocolVersion",
  clientInfo: "io.modelcontextprotocol/clientInfo",
  clientCapabilities: "io.modelcontextprotocol/clientCapabilities",
  serverInfo: "io.modelcontextprotocol/serverInfo",
  subscriptionId: "io.modelcontextprotocol/subscriptionId",
} as const;

/**
 * Whether a value names a revision opened with `initialize`.
 *
 * @param value - What a client named
 * @returns Whether it is one this server speaks
 * @example
 * ```ts
 * isLegacyVersion("2025-06-18"); // true
 * ```
 */
export function isLegacyVersion(value: unknown): value is LegacyVersion {
  return (LEGACY_VERSIONS as readonly unknown[]).includes(value);
}

/**
 * Whether a value names a revision whose requests each carry their version.
 *
 * @param value - What a request named
 * @returns Whether it is one this server speaks
 * @example
 * ```ts
 * isModernVersion("2026-07-28"); // true
 * ```
 */
export function isModernVersion(value: unknown): value is ModernVersion {
  return (MODERN_VERSIONS as readonly unknown[]).includes(value);
}

/**
 * Whether a revision knows a tool's title, its output schema and the
 * structured content a call answers with — every one since 2025-06-18.
 *
 * @param version - The revision a request is served under
 * @returns Whether the three are part of it
 * @example
 * ```ts
 * hasStructuredOutput("2025-03-26"); // false
 * ```
 */
export function hasStructuredOutput(version: LegacyVersion | ModernVersion): boolean {
  return version !== "2025-03-26";
}
