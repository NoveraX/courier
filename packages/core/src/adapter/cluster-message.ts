import { isRecord } from "../utils/is-record";
import type { Selection } from "./connection-selector";
import { COMMAND_KINDS, type ConnectionCommand, readCommand } from "./ws-connection-command";

/**
 * The version of the messages replicas exchange on the control channel. A
 * field a replica would act on is a new version, which a replica that does
 * not know it skips rather than half understands.
 */
const VERSION = 1;
/** The longest message id taken, in characters. */
const MAX_ID_LENGTH = 64;

/** What one replica sends the others on the control channel. */
export interface ClusterMessage {
  readonly v: typeof VERSION;
  /** Unique: a replica acts on one id once */
  readonly id: string;
  /** When it was sent, in milliseconds since the epoch: a replica acts on it only near that time */
  readonly at: number;
  readonly cmd: ConnectionCommand;
  /** With a cluster secret, the HMAC-SHA-256 of the rest, in hex */
  readonly sig?: string;
}

/** A message read; one a newer replica sent, skipped; or why it is no message. */
export type ReadMessage =
  | { readonly message: ClusterMessage; readonly selection: Selection }
  | { readonly skipped: "version" | "kind" }
  | { readonly malformed: string };

/**
 * Read what arrived on the control channel, whoever sent it: a command of a
 * version and a kind this replica knows, every field checked and bounded —
 * the command as the application's own is (`readCommand`) — or why it was
 * set aside. A newer replica's message, as during a rolling deploy, is
 * skipped; anything else that is not one is malformed. Reading never
 * throws, whatever arrives.
 *
 * @param raw - The payload as the adapter delivered it
 * @returns The message and what its command selects, or why it is set aside
 *
 * @example
 * ```ts
 * const read = readClusterMessage(raw);
 * if ("message" in read) runCommand({ command: read.message.cmd, selection: read.selection }, registry);
 * ```
 */
export function readClusterMessage(raw: unknown): ReadMessage {
  if (!isRecord(raw)) return { malformed: "a cluster message is an object" };
  const { v, id, at, cmd, sig } = raw;
  if (typeof v === "number" && v !== VERSION) return { skipped: "version" };
  if (v !== VERSION) return { malformed: "a cluster message names its version" };
  if (typeof id !== "string" || id.length === 0 || id.length > MAX_ID_LENGTH) {
    return { malformed: `a cluster message has an id of 1 to ${MAX_ID_LENGTH} characters` };
  }
  if (typeof at !== "number" || !Number.isFinite(at)) {
    return { malformed: "a cluster message says when it was sent" };
  }
  if (sig !== undefined && typeof sig !== "string") {
    return { malformed: "a cluster message's signature is a string" };
  }
  if (isRecord(cmd) && typeof cmd.kind === "string" && !COMMAND_KINDS.has(cmd.kind)) {
    return { skipped: "kind" };
  }
  const read = readCommand(cmd);
  if (typeof read === "string") return { malformed: read };
  const message: ClusterMessage = { v, id, at, cmd: read.command };
  return { message: sig === undefined ? message : { ...message, sig }, selection: read.selection };
}
