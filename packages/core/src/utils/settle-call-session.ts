import type { Context } from "../http-client/types";
import { createLogger } from "../logger";
import type { CallSession } from "../session/call-session";
import { type CallRunner, primeCsrfToken } from "./csrf-prime";
import { type FailureReport, reportRequestError } from "./execute-error-report";
import { buildErrorResponse } from "./execute-response";
import type { CallTarget } from "./execute-target";

const log = createLogger("Session");

/** A call whose session is being settled. */
export interface SettleCall {
  readonly target: CallTarget;
  readonly context: Context | undefined;
  /** The call's signal: aborted, the call stops waiting for its token */
  readonly signal: AbortSignal | undefined;
  /** Runs a call as every call runs, for the token's */
  readonly run: CallRunner;
  /** How Studio knows the call, which a refusal or a failure here ends; absent while Studio is not attached */
  readonly told: FailureReport | undefined;
}

/** What a call goes on with once its session is found, or the answer that refuses it. */
export type SettledSession =
  | { readonly session: CallSession | undefined; readonly primed: readonly string[] }
  | { readonly refused: unknown };

/**
 * Wait for what the session gives a call, and settle it. A write the session
 * may not make is refused with 403, before anything is sent; one that finds
 * no double-submit token asks for it first, where the API says it comes
 * from. Studio is told of a call this ends, refused or failed, so it does
 * not show as pending.
 *
 * @param pending - What `startCallSession` found as the call started
 * @param call - The call, what runs its token's request, and how Studio knows it
 * @returns The session to send the call with, and the cookies its token's answer set; or the refusal
 * @example
 * ```ts
 * const settled = await settleCallSession(pendingSession, { target, context, signal, run, told });
 * if ("refused" in settled) return settled.refused;
 * ```
 */
export async function settleCallSession(
  pending: CallSession | Promise<CallSession | undefined> | undefined,
  call: SettleCall,
): Promise<SettledSession> {
  const found = await toldIfFailed(pending, call.told);
  if (found?.refusal !== undefined) return refuse(call, found.refusal);
  if (found?.primeFrom === undefined) return { session: found, primed: [] };
  const { target, context, run } = call;
  const settled = await toldIfFailed(
    primeCsrfToken({ target, context, session: found, run }, call.signal),
    call.told,
  );
  const refusal = settled.session?.refusal;
  return refusal === undefined ? settled : refuse(call, refusal);
}

function refuse(call: SettleCall, refusal: string): SettledSession {
  log.warn(`Refused: ${refusal}`);
  return { refused: buildErrorResponse(call.context, 403, refusal, call.told?.requestId) };
}

/* A failure goes on as it came — a render a framework stops, a write that
   stopped waiting for its token — and Studio is told of it. */
async function toldIfFailed<TValue>(
  work: TValue | Promise<TValue>,
  told: FailureReport | undefined,
): Promise<TValue> {
  try {
    return await work;
  } catch (error) {
    if (told !== undefined) reportRequestError(error, told, undefined);
    throw error;
  }
}
