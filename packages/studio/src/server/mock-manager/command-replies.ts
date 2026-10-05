import type { ChildMessage } from "@noverax/courier-mock/managed";

/** A mock's answer to a command: whether it ran it, why not when it did not, and what it answered with. */
export interface CommandReply {
  ok: boolean;
  error?: string;
  /** What the command answers with, such as a request's whole body. */
  data?: unknown;
}

type CommandResult = Extract<ChildMessage, { type: "command-result" }>;

/** The commands sent to one mock's worker that it has not answered yet; see `createCommandReplies`. */
export interface CommandReplies {
  /** A fresh id to send a command under, and the answer that arrives with that id. */
  expect(): { requestId: string; reply: Promise<CommandReply> };
  /** Hand the worker's answer to the command it answers. */
  settle(result: CommandResult): void;
  /** Answer every command still waiting with `error`: the worker will not. */
  failAll(error: string): void;
}

/**
 * Track the commands sent to one worker until it answers each.
 *
 * Every command goes out under an id of its own, and the worker's
 * `command-result` names it, so each answer reaches the command it answers
 * however many are in flight. A worker that exits answers none of the rest;
 * {@link CommandReplies.failAll} settles them with the reason.
 *
 * @returns The commands in flight to one worker
 * @example
 * ```ts
 * const replies = createCommandReplies();
 * const { requestId, reply } = replies.expect();
 * child.send({ type: "command", command, requestId });
 * child.on("message", (msg) => msg.type === "command-result" && replies.settle(msg));
 * await reply; // → { ok: true }
 * ```
 */
export function createCommandReplies(): CommandReplies {
  const waiting = new Map<string, (reply: CommandReply) => void>();
  let sent = 0;
  return {
    expect() {
      sent += 1;
      const requestId = `cmd_${sent}`;
      const reply = new Promise<CommandReply>((resolve) => waiting.set(requestId, resolve));
      return { requestId, reply };
    },
    settle({ requestId, ok, error, data }) {
      const resolve = waiting.get(requestId);
      if (!resolve) return;
      waiting.delete(requestId);
      if (!ok) resolve({ ok, error: error ?? "The mock did not run the command." });
      else resolve(data === undefined ? { ok } : { ok, data });
    },
    failAll(error) {
      for (const resolve of waiting.values()) resolve({ ok: false, error });
      waiting.clear();
    },
  };
}
