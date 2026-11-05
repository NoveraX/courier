import { createLogger } from "../logger";
import { describeFailure } from "../realtime/describe-failure";
import { connectionMetaOf } from "./connection-meta-of";
import { awaitCredentials } from "./ws-admit";
import { connectionFields } from "./ws-connection-fields";
import type { WSSocketContext } from "./ws-context";
import type { SessionClose } from "./ws-dialect";
import type { WSInbox } from "./ws-inbox";
import type { WSHandlerConfig } from "./ws-types";

const log = createLogger("WS");

/** What admitting a connection runs, and for how long it waits. */
export interface AdmissionRules {
  readonly onConnect: NonNullable<WSHandlerConfig["onConnect"]>;
  /** How long the client's first frame is waited for */
  readonly authTimeoutMs: number;
  /** How long `onConnect` may take */
  readonly hookTimeoutMs: number;
  /** Whether the client has left while it was being admitted */
  readonly left: () => boolean;
}

/** How admitting a connection came out. */
export type AdmissionOutcome = "admitted" | "refused" | "left";

const TIMED_OUT = Symbol("onConnect did not settle in time");

/**
 * Admit a connection: wait for the credentials of its first frame, and
 * take what `onConnect` makes of them as its metadata. A connection
 * `onConnect` refuses — or one whose frame is none a client sends — is
 * closed with why, and the refusal logged on one line; an `onConnect` that
 * has not settled by its deadline closes it as a fault of the server, which
 * the client may retry.
 *
 * @param ctx - The connection
 * @param inbox - What its socket sent before it was admitted
 * @param rules - The hook and its deadlines
 * @returns Whether it was admitted, refused, or left first
 * @example
 * ```ts
 * if ((await admitConnection(ctx, inbox, rules)) === "admitted") activate(ctx);
 * ```
 */
export async function admitConnection(
  ctx: WSSocketContext,
  inbox: WSInbox,
  rules: AdmissionRules,
): Promise<AdmissionOutcome> {
  const admission = await awaitCredentials(ctx, inbox, rules.authTimeoutMs);
  if (rules.left()) return "left";
  if ("invalid" in admission) {
    refuse(ctx, new Error("Its auth frame was not one a client sends"));
    return "refused";
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { connectionId, request } = ctx;
    const result = await Promise.race([
      Promise.resolve(rules.onConnect({ connectionId, request, auth: admission.auth })),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), rules.hookTimeoutMs);
      }),
    ]);
    if (result === TIMED_OUT) {
      log.error(`onConnect did not settle within ${rules.hookTimeoutMs} ms (conn=${connectionId})`);
      ctx.session.close({ kind: "admission-timeout" });
      return "refused";
    }
    ctx.meta = connectionMetaOf(result, "onConnect");
    return "admitted";
  } catch (error) {
    refuse(ctx, error);
    return "refused";
  } finally {
    clearTimeout(timer);
  }
}

/* What was thrown is the log's; the client hears a `RealtimeError`'s own
   code and message, or "Connection rejected". */
function refuse(ctx: WSSocketContext, error: unknown): void {
  const why: SessionClose = {
    kind: "auth-refused",
    failure: describeFailure(error, "Connection rejected", 4401),
  };
  const { code } = ctx.session.dialect.closeOf(why);
  ctx.refusals.warn({ event: "connection refused", code, fields: connectionFields(ctx) }, error);
  ctx.session.close(why);
}
