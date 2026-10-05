import type { BodyPart, KeptBodies } from "@noverax/courier/internal";
import { KEPT_BODY_BYTES } from "@noverax/courier/internal";
import { CommandInputError, nameIn } from "./command-input";
import type { CmdResult } from "./store-commands";

function partIn(command: Record<string, unknown>): BodyPart {
  const { part } = command;
  if (part === "request" || part === "response") return part;
  throw new CommandInputError(`"part" must be "request" or "response", got ${String(part)}`);
}

/**
 * Answer `mock:request:body`: the whole body of one of the mock's latest
 * requests, as JSON, when its event carried only a part of it.
 *
 * @param bodies - The bodies the mock keeps
 * @param command - The command: the request's id, and which of its bodies
 * @returns The body as JSON text, or why there is none
 * @example
 * ```ts
 * answerBodyCommand(bodies, { action: "mock:request:body", requestId: "req_7", part: "response" });
 * ```
 */
export function answerBodyCommand(bodies: KeptBodies, command: Record<string, unknown>): CmdResult {
  try {
    const part = partIn(command);
    const text = bodies.textOf(nameIn(command, "requestId"), part);
    if (text !== undefined) return { ok: true, data: text };
    return {
      ok: false,
      error: `The mock no longer keeps this request's whole ${part} body: it keeps those of its latest requests, up to ${KEPT_BODY_BYTES / 1024 / 1024} MB.`,
    };
  } catch (error) {
    if (error instanceof CommandInputError) return { ok: false, error: error.message };
    throw error;
  }
}
