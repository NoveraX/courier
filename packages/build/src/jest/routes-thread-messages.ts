import { isRecord } from "../util/is-record";

/** What the transformer asks the thread that reads the routes. */
export interface RoutesThreadRequest {
  /** The project's root: Jest's `rootDir`. */
  readonly root: string;
  /** The config, from the root or absolute, when it is not the one found from it. */
  readonly config?: string | undefined;
}

/** What the thread answers: the routes module, as each module system takes it, or why there is none. */
export type RoutesThreadReply =
  | { readonly ok: true; readonly module: string; readonly commonJs: string }
  | { readonly ok: false; readonly message: string };

/**
 * Whether a message is the thread's answer.
 *
 * @param message - What came over the channel
 * @returns Whether it is an answer
 * @example
 * ```ts
 * if (isRoutesThreadReply(message)) settle(message);
 * ```
 */
export function isRoutesThreadReply(message: unknown): message is RoutesThreadReply {
  if (!isRecord(message)) return false;
  if (message.ok === true) {
    return typeof message.module === "string" && typeof message.commonJs === "string";
  }
  return message.ok === false && typeof message.message === "string";
}
