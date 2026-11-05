import { createLogger } from "../logger";
import { describeFailure } from "../realtime/describe-failure";
import { connectionMetaOf } from "./connection-meta-of";
import { awaitCredentials } from "./ws-admit";
import { closeOf, type SessionClose } from "./ws-close";
import { connectionFields } from "./ws-connection-fields";
import type { WSSocketContext } from "./ws-context";
import type { WSInbox } from "./ws-inbox";
import type { WSHandlerConfig } from "./ws-types";

const log = createLogger("WS");

/** What admitting a connection runs, and for how long it waits. */
export interface AdmissionRules {
  /** Makes the connection's metadata of its credentials, when the handler has it */
  readonly onConnect: WSHandlerConfig["onConnect"];
  /** Told of a connection `onConnect` admitted whose client had left by then */
  readonly onDisconnect: WSHandlerConfig["onDisconnect"];
  /** How long the client's first frame is waited for */
  readonly authTimeoutMs: number;
  /** How long `onConnect` may take */
  readonly hookTimeoutMs: number;
  /** The code the socket closed with, when the client left while it was being admitted */
  readonly left: () => number | undefined;
  /**
   * Takes the connection's place under a limit on its key's connections,
   * once `onConnect` has said who it is: false when the limit refuses it
   */
  readonly limit?: ((ctx: WSSocketContext) => Promise<boolean>) | undefined;
}

/** How admitting a connection came out: let in, with the id of its `auth` frame; refused; or left first. */
export type AdmissionOutcome =
  | { readonly kind: "admitted"; readonly id: string | undefined }
  | { readonly kind: "refused" }
  | { readonly kind: "left" };

const REFUSED: AdmissionOutcome = { kind: "refused" };
const LEFT: AdmissionOutcome = { kind: "left" };
const TIMED_OUT = Symbol("onConnect did not settle in time");

/**
 * Admit a connection: wait for its first frame, an `auth` of the protocol
 * version spoken here, and take what `onConnect` makes of its credentials
 * as its metadata. A first frame of another kind or version, none in time,
 * or credentials `onConnect` refuses close the connection with why, after
 * `auth_error`, and the refusal is logged on one line; an `onConnect` that
 * has not settled by its deadline closes it as a fault of the server,
 * which the client may retry. Under a limit on its key's connections, it
 * then takes its place, and one the limit refuses is closed with 4429. A
 * client that left while `onConnect` admitted it, and one the limit
 * refused, has its `onDisconnect` run, so what `onConnect` set up is undone.
 *
 * @param ctx - The connection
 * @param inbox - What its socket sent before it was admitted
 * @param rules - The hook and its deadlines
 * @returns Whether it was admitted, with its `auth` frame's id, refused, or left first
 * @example
 * ```ts
 * const outcome = await admitConnection(ctx, inbox, rules);
 * if (outcome.kind === "admitted") activate(ctx, outcome.id);
 * ```
 */
export async function admitConnection(
  ctx: WSSocketContext,
  inbox: WSInbox,
  rules: AdmissionRules,
): Promise<AdmissionOutcome> {
  const admission = await awaitCredentials(ctx, inbox, rules.authTimeoutMs);
  if (rules.left() !== undefined) return LEFT;
  if ("refused" in admission) {
    refuse(ctx, admission.refused, undefined);
    return REFUSED;
  }
  const { id } = admission;
  if (rules.onConnect) {
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
        log.error(
          `onConnect did not settle within ${rules.hookTimeoutMs} ms (conn=${connectionId})`,
        );
        ctx.session.close({ kind: "admission-timeout" });
        return REFUSED;
      }
      ctx.meta = connectionMetaOf(result, "onConnect");
    } catch (error) {
      const failure = describeFailure(error, "Connection rejected", 4401);
      refuse(ctx, { kind: "auth-refused", failure, id }, error);
      return REFUSED;
    } finally {
      clearTimeout(timer);
    }
  }
  /* Admitted by onConnect, so onDisconnect hears of it however it ends here. */
  if (rules.limit && !(await rules.limit(ctx))) {
    const why = { kind: "limit" } as const;
    ctx.session.close(why);
    await disconnected(ctx, rules, closeOf(why).code);
    return REFUSED;
  }
  const code = rules.left();
  if (code === undefined) return { kind: "admitted", id };
  await disconnected(ctx, rules, code);
  return LEFT;
}

async function disconnected(ctx: WSSocketContext, rules: AdmissionRules, code: number) {
  try {
    await rules.onDisconnect?.({ connectionId: ctx.connectionId, meta: ctx.meta, code });
  } catch (error) {
    log.warn("onDisconnect hook failed", error);
  }
}

/* What was thrown is the log's; the client hears a `RealtimeError`'s own
   code and message, or "Connection rejected", in `auth_error`. */
function refuse(ctx: WSSocketContext, why: SessionClose, cause: unknown): void {
  const { code } = closeOf(why);
  ctx.refusals.warn({ event: "connection refused", code, fields: connectionFields(ctx) }, cause);
  ctx.session.close(why);
}
