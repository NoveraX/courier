import type { AgentClient } from "@noverax/courier";

import { isRecord } from "../is-record";
import type { Connection } from "./connection";
import { ERROR_CODE } from "./json-rpc";
import { McpProtocolError } from "./protocol-error";
import {
  isLegacyVersion,
  isModernVersion,
  LEGACY_VERSIONS,
  type LegacyVersion,
  META,
  MODERN_VERSIONS,
  type ModernVersion,
} from "./versions";

/** The revision a request is served under, and what its client declared for it. */
export type Era =
  | {
      readonly kind: "modern";
      readonly version: ModernVersion;
      readonly capabilities: Record<string, unknown>;
      readonly client?: AgentClient | undefined;
    }
  | {
      readonly kind: "legacy";
      readonly version: LegacyVersion;
      /** Unknown to a stateless HTTP request, which does not carry them. */
      readonly capabilities: Record<string, unknown> | undefined;
      readonly client?: AgentClient | undefined;
    };

/**
 * Which revision a request is served under.
 *
 * A request that names its version in `_meta` is served under it, whatever
 * came before. Otherwise a stdio connection serves what its `initialize`
 * settled, and an HTTP request the revision its header names — a header
 * missing altogether being 2025-03-26's, which had none.
 *
 * @param params - The request's params
 * @param connection - What it arrived over
 * @returns The era
 * @throws McpProtocolError `-32022` for a revision this server does not speak,
 *   `-32602` for a request that names none it can be served under
 * @example
 * ```ts
 * eraOf({ _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", … } }, connection);
 * ```
 */
export function eraOf(params: Record<string, unknown>, connection: Connection): Era {
  const meta = isRecord(params._meta) ? params._meta : {};
  const named = meta[META.protocolVersion];
  if (named !== undefined) return modernEra(named, meta);
  if (connection.legacy !== undefined) return { kind: "legacy", ...connection.legacy };
  if (connection.transport === "stdio") {
    throw new McpProtocolError(
      ERROR_CODE.invalidParams,
      `Name the protocol version in _meta ("${META.protocolVersion}": "${MODERN_VERSIONS[0]}"), or open the connection with initialize`,
    );
  }
  const header = connection.headerVersion ?? "2025-03-26";
  if (isLegacyVersion(header)) return { kind: "legacy", version: header, capabilities: undefined };
  if (isModernVersion(header)) {
    throw new McpProtocolError(
      ERROR_CODE.invalidParams,
      `A request under ${header} names its version in _meta ("${META.protocolVersion}")`,
    );
  }
  throw unsupported(header);
}

function modernEra(named: unknown, meta: Record<string, unknown>): Era {
  if (!isModernVersion(named)) throw unsupported(named);
  const capabilities = meta[META.clientCapabilities];
  if (!isRecord(capabilities)) {
    throw new McpProtocolError(
      ERROR_CODE.invalidParams,
      `A request names its client's capabilities in _meta ("${META.clientCapabilities}")`,
    );
  }
  return { kind: "modern", version: named, capabilities, client: clientOf(meta[META.clientInfo]) };
}

function unsupported(requested: unknown): McpProtocolError {
  return new McpProtocolError(ERROR_CODE.unsupportedVersion, "Unsupported protocol version", {
    supported: [...MODERN_VERSIONS],
    requested,
  });
}

/**
 * The client as it named itself, when it did: for display, never for a decision.
 *
 * @param info - An `Implementation`: `{ name, version }`
 * @returns The client, or `undefined` when it named none
 * @example
 * ```ts
 * clientOf({ name: "code-editor", version: "2.1.0" });
 * ```
 */
export function clientOf(info: unknown): AgentClient | undefined {
  if (!isRecord(info) || typeof info.name !== "string") return undefined;
  return { name: info.name, ...(typeof info.version === "string" && { version: info.version }) };
}

/** The revision `initialize` answers with: the one asked for when this server speaks it, its newest otherwise. */
export function legacyVersionFor(requested: unknown): LegacyVersion {
  return isLegacyVersion(requested) ? requested : LEGACY_VERSIONS[0];
}
