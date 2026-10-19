import { configFileName } from "@/store/config-file-name";
import type { ConfigStatusPayload } from "@/store/config-status";
import type { ConnectionStatus } from "@/store/types-ui";

/**
 * Why the sources shown are not what the config on disk declares: it does
 * not load, or it was deleted. Studio shows what it loaded at `lastGoodAt`.
 */
export type ConfigNoticeState =
  | { tone: "error"; configFile: string; message: string; lastGoodAt: number }
  | { tone: "warning"; configFile: string; lastGoodAt: number };

/** What the APIs page shows. */
export type ApisPageView =
  /** The page is connecting to Studio for the first time. */
  | { kind: "connecting" }
  /** Studio cannot be reached, and never told the page what the config declares. */
  | { kind: "unreachable" }
  /** Studio has not told yet how the config loads, or its first load runs. */
  | { kind: "loading" }
  /** The project has no config, and Studio never ran one. */
  | { kind: "no-config" }
  /** The config does not load, and Studio never ran one. */
  | { kind: "broken"; configFile: string; message: string }
  /** The sources Studio runs, with why they may be out of date. */
  | { kind: "sources"; notice: ConfigNoticeState | null }
  /** Studio runs a config that declares no sources. */
  | { kind: "empty"; notice: ConfigNoticeState | null };

/** What the APIs page shows, and why Import is refused; `null` when it is allowed. */
export type ApisPageState = ApisPageView & { importBlocked: string | null };

/** What the APIs page is derived from. */
export interface ApisPageInput {
  connection: ConnectionStatus;
  status: ConfigStatusPayload | null;
  /** How many sources the catalogue Studio sent lists. */
  sourceCount: number;
}

const NOT_CONNECTED = "Studio is not connected";

/**
 * Decide what the APIs page shows from the connection and the config's
 * status. The page waits only for what it cannot know yet: once Studio tells
 * the status, a project without a config, a config that never loaded and a
 * config with no sources each get their own state. While the config does not
 * load, the page keeps the sources Studio runs and says since when.
 *
 * Only the page's first connection is waited for. Cut off from Studio, the
 * page shows what Studio told it last, or says Studio cannot be reached when
 * it told nothing — it never loads for ever.
 *
 * Import is allowed only while the config loads: Studio declares every import
 * in it, and refuses to import while it cannot read it.
 *
 * @param input - The connection, the status, and how many sources were sent
 * @returns What to show, and why Import is refused
 *
 * @example
 * ```ts
 * const status = { state: "missing", revision: 1, configFile: null, lastGoodAt: null } as const;
 * apisPageState({ connection: "connected", status, sourceCount: 0 });
 * // → { kind: "no-config", importBlocked: "Create courier.config.ts first" }
 * apisPageState({ connection: "disconnected", status: null, sourceCount: 0 });
 * // → { kind: "unreachable", importBlocked: "Studio is not connected" }
 * ```
 */
export function apisPageState({ connection, status, sourceCount }: ApisPageInput): ApisPageState {
  if (connection !== "connected") return offlineState(connection, status, sourceCount);
  /* No status yet is this page's wait, not Studio loading the config. */
  if (status === null) return { kind: "loading", importBlocked: "Waiting for Studio" };
  if (status.state === "starting") {
    return { kind: "loading", importBlocked: "Studio is still loading courier.config" };
  }
  const file = configFileName(status);
  return { ...viewOf(status, file, sourceCount), importBlocked: importBlockedBy(status, file) };
}

type ConfigOutcome = Exclude<ConfigStatusPayload, { state: "starting" }>;

function offlineState(
  connection: ConnectionStatus,
  status: ConfigStatusPayload | null,
  sourceCount: number,
): ApisPageState {
  if (connection === "connecting") return { kind: "connecting", importBlocked: NOT_CONNECTED };
  if (status === null || status.state === "starting") {
    const view: ApisPageView =
      sourceCount > 0 ? { kind: "sources", notice: null } : { kind: "unreachable" };
    return { ...view, importBlocked: NOT_CONNECTED };
  }
  return { ...viewOf(status, configFileName(status), sourceCount), importBlocked: NOT_CONNECTED };
}

function viewOf(status: ConfigOutcome, file: string, sourceCount: number): ApisPageView {
  if (status.state === "failed" && status.lastGoodAt === null) {
    return { kind: "broken", configFile: file, message: status.error.message };
  }
  if (status.state === "missing" && status.lastGoodAt === null) return { kind: "no-config" };
  const notice = noticeOf(status, file);
  return sourceCount > 0 ? { kind: "sources", notice } : { kind: "empty", notice };
}

function noticeOf(status: ConfigOutcome, file: string): ConfigNoticeState | null {
  if (status.state === "loaded" || status.lastGoodAt === null) return null;
  if (status.state === "missing") {
    return { tone: "warning", configFile: file, lastGoodAt: status.lastGoodAt };
  }
  return {
    tone: "error",
    configFile: file,
    message: status.error.message,
    lastGoodAt: status.lastGoodAt,
  };
}

function importBlockedBy(status: ConfigOutcome, file: string): string | null {
  switch (status.state) {
    case "loaded":
      return null;
    case "failed":
      return `${file} does not load; fix it first`;
    case "missing":
      return status.lastGoodAt === null
        ? "Create courier.config.ts first"
        : `${file} was deleted; restore it first`;
  }
}
