import { isRecord } from "../utils/is-record";
import { closeReason } from "./close-reason";
import { readSelector, type Selection } from "./connection-selector";
import { isSendableCloseCode } from "./ws-dialect";
import type {
  ConnectionSelector,
  DisconnectOptions,
  InternalConnectionRegistry,
  RegistryEntry,
  RequireAuthOptions,
} from "./ws-registry-types";

/** The longest deadline a timer keeps: `setTimeout` fires at once past it. */
const MAX_TIMEOUT_MS = 2_147_483_647;
/** The most bytes a close frame carries as its reason (RFC 6455, 5.5). */
const MAX_REASON_BYTES = 123;

const encoder = new TextEncoder();

/** What the application asks of the connections a selector names, checked, as it travels between replicas. */
export type ConnectionCommand =
  | {
      readonly kind: "disconnect";
      readonly selector: ConnectionSelector;
      readonly code: number;
      readonly reason: string;
    }
  | {
      readonly kind: "require-auth";
      readonly selector: ConnectionSelector;
      /** Absent, each replica gives its own `authRequiredTimeoutMs` */
      readonly timeoutMs?: number;
    }
  | {
      /** Given up for newer connections of their key, which a limit admitted */
      readonly kind: "evict";
      readonly selector: { readonly id: readonly string[] };
    };

/** A command read, with the connections it selects. */
export interface CheckedCommand {
  readonly command: ConnectionCommand;
  readonly selection: Selection;
}

/** The kinds of command a replica carries out; another is a newer replica's. */
export const COMMAND_KINDS: ReadonlySet<string> = new Set(["disconnect", "require-auth", "evict"]);

/**
 * Read a command — the application's, or one another replica sent — into
 * the fields a replica acts on, or say why it is none: a selector that
 * names no connection, a code no socket can send, a reason over the 123
 * bytes a close carries, a deadline no timer keeps.
 *
 * @param value - The command as it came
 * @returns The command and what it selects, or why it is none
 */
export function readCommand(value: unknown): CheckedCommand | string {
  if (typeof value !== "object" || value === null) return "a command is an object";
  const { kind, selector, code, reason, timeoutMs } = value as Record<string, unknown>;
  const selection = readSelector(selector);
  if (typeof selection === "string") return selection;
  if (kind === "disconnect") {
    if (typeof code !== "number" || !isSendableCloseCode(code)) {
      return "a connection closes with 1000-1014 but 1004-1006, or with 3000-4999";
    }
    if (typeof reason !== "string" || encoder.encode(reason).length > MAX_REASON_BYTES) {
      return `a connection closes with a reason of at most ${MAX_REASON_BYTES} bytes`;
    }
    return { command: { kind, selector: selector as ConnectionSelector, code, reason }, selection };
  }
  if (kind === "evict") {
    if (!("ids" in selection) || !isRecord(selector)) return "connections are evicted by their ids";
    return { command: { kind, selector: { id: selection.ids } }, selection };
  }
  if (kind !== "require-auth")
    return "a command disconnects, asks for credentials again, or evicts";
  if (timeoutMs === undefined)
    return { command: { kind, selector: selector as ConnectionSelector }, selection };
  if (!isDeadline(timeoutMs)) {
    return `credentials are asked for within a whole number of 0 to ${MAX_TIMEOUT_MS} ms`;
  }
  return { command: { kind, selector: selector as ConnectionSelector, timeoutMs }, selection };
}

/**
 * The command to close the connections a selector names.
 *
 * @throws TypeError for a selector that names no connection, or a code no socket can send
 */
export function disconnectCommand(
  selector: ConnectionSelector,
  options: DisconnectOptions | undefined,
): CheckedCommand {
  const reason = closeReason(options?.reason ?? "Disconnected by server");
  return checked({ kind: "disconnect", selector, code: options?.code ?? 1000, reason });
}

/**
 * The command to ask the connections a selector names for their credentials again.
 *
 * @throws TypeError for a selector that names no connection, or a deadline no timer keeps
 */
export function requireAuthCommand(
  selector: ConnectionSelector,
  options: RequireAuthOptions | undefined,
): CheckedCommand {
  const timeoutMs = options?.timeoutMs;
  return checked(
    timeoutMs === undefined
      ? { kind: "require-auth", selector }
      : { kind: "require-auth", selector, timeoutMs },
  );
}

/**
 * The command to close connections a limit gave up for newer ones of their key.
 *
 * @throws TypeError for no id, or more than a selector names
 */
export function evictCommand(connectionIds: readonly string[]): CheckedCommand {
  return checked({ kind: "evict", selector: { id: connectionIds } });
}

/**
 * Carry a command out on the connections of this replica it selects.
 *
 * @returns The entries it reached
 */
export function runCommand(
  { command, selection }: CheckedCommand,
  registry: InternalConnectionRegistry,
): RegistryEntry[] {
  const entries = registry.select(selection);
  for (const entry of entries) {
    if (command.kind === "disconnect") entry.close(command.code, command.reason);
    else if (command.kind === "evict") entry.evict();
    else entry.requireAuth(command.timeoutMs);
  }
  return entries;
}

function checked(command: ConnectionCommand): CheckedCommand {
  const read = readCommand(command);
  if (typeof read === "string") throw new TypeError(read);
  return read;
}

function isDeadline(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_TIMEOUT_MS;
}
