import type { Context } from "../http-client/types";
import { createLogger } from "../logger";
import type { CallSession } from "../session/call-session";
import { type CallRunner, primeCsrfToken } from "./csrf-prime";
import { buildErrorResponse } from "./execute-response";
import type { CallTarget } from "./execute-target";

const log = createLogger("Session");

/** What a call goes on with once its session is found, or the answer that refuses it. */
export type SettledSession =
  | { readonly session: CallSession | undefined; readonly primed: readonly string[] }
  | { readonly refused: unknown };

/**
 * Wait for what the session gives a call, and settle it. A write the session
 * may not make is refused with 403, before anything is sent; one that finds
 * no double-submit token asks for it first, where the API says it comes
 * from.
 *
 * @param pending - What `startCallSession` found as the call started
 * @param target - The call
 * @param context - Its context
 * @param signal - The call's signal
 * @param run - Runs a call as every call runs, for the token's
 * @returns The session to send the call with, and the cookies its token's answer set; or the refusal
 * @example
 * ```ts
 * const settled = await settleCallSession(pendingSession, target, context, signal, runPrime);
 * if ("refused" in settled) return settled.refused;
 * ```
 */
export async function settleCallSession(
  pending: CallSession | Promise<CallSession | undefined> | undefined,
  target: CallTarget,
  context: Context | undefined,
  signal: AbortSignal | null | undefined,
  run: CallRunner,
): Promise<SettledSession> {
  const found = await pending;
  if (found?.refusal !== undefined) return refuse(context, found.refusal);
  if (found?.primeFrom === undefined) return { session: found, primed: [] };
  const settled = await primeCsrfToken(
    { target, context, session: found, run },
    signal ?? undefined,
  );
  const refusal = settled.session?.refusal;
  return refusal === undefined ? settled : refuse(context, refusal);
}

function refuse(context: Context | undefined, refusal: string): SettledSession {
  log.warn(`Refused: ${refusal}`);
  return { refused: buildErrorResponse(context, 403, refusal) };
}
