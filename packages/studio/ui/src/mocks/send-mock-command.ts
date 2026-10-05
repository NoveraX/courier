import { getSocket } from "@/socket";
import { isPlainObject } from "@/socket/is-plain-object";

/** A mock's answer to a command: whether it ran it, and why not when it did not. */
export interface MockCommandReply {
  ok: boolean;
  error?: string;
  /** What the command answered with, such as a request's whole body. */
  data?: unknown;
}

/** A command for one mock Studio runs: what to do, and the fields that action reads. */
export interface MockCommand extends Record<string, unknown> {
  action: string;
  serverId: string;
}

const REPLY_TIMEOUT = 10_000;
const NO_ANSWER: MockCommandReply = { ok: false, error: "The mock did not answer." };

/**
 * Send a command to a mock Studio runs, and wait for the mock to say whether
 * it ran it.
 *
 * Studio answers once the mock has. A refusal carries the mock's reason, and
 * a mock that has not answered within ten seconds counts as one that did not
 * run the command.
 *
 * @param command - The command, naming the mock in `serverId`
 * @returns The mock's answer
 * @example
 * ```ts
 * const reply = await sendMockCommand({ action: "mock:store:seed", serverId: "apiMock", collection: "*" });
 * if (!reply.ok) toast.error("Could not seed", { description: reply.error });
 * ```
 */
export function sendMockCommand(command: MockCommand): Promise<MockCommandReply> {
  return new Promise((resolve) => {
    getSocket()
      .timeout(REPLY_TIMEOUT)
      .emit("mock:command", command, (error: Error | null, reply: unknown) => {
        resolve(error ? NO_ANSWER : replyOf(reply));
      });
  });
}

/* Studio's answer, read as data: it arrives over the socket. */
function replyOf(raw: unknown): MockCommandReply {
  if (!isPlainObject(raw) || typeof raw.ok !== "boolean") return NO_ANSWER;
  if (raw.ok) return raw.data === undefined ? { ok: true } : { ok: true, data: raw.data };
  const error = typeof raw.error === "string" ? raw.error : "The mock did not run the command.";
  return { ok: false, error };
}
