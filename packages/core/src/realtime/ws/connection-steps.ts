import { fromErrorCode, type RealtimeError } from "../errors";
import type {
  MachineContext,
  MachineEffect,
  MachineState,
  ReconnectCause,
  Refusal,
  Step,
} from "./connection-machine-types";
import { classifyClose, MESSAGE_TOO_BIG, type SocketClosure } from "./reconnect-classifier";

/** The same state, nothing to do. */
export function stay(state: MachineState): Step {
  return { state, effects: [] };
}

/**
 * Start an attempt: ask for the credentials it opens with.
 *
 * @param from - What the connection keeps from before
 * @param failures - Attempts in a row that failed before this one
 * @param refusal - Credentials the server refused, when this attempt is the one retry they allow
 */
export function connect(
  from: MachineState,
  ctx: MachineContext,
  failures: number,
  refusal: Refusal | undefined,
  effects: readonly MachineEffect[] = [],
): Step {
  return {
    state: {
      phase: "connecting",
      failures,
      authSeq: from.authSeq,
      refusal,
      socket: false,
      deadline: { ms: ctx.connectTimeoutMs, fires: "timeout" },
    },
    effects: [...effects, { type: "ask-credentials" }],
  };
}

/** Give up: every subscription ends with `error`; only `reconnect()` tries again. */
export function fail(
  from: MachineState,
  error: RealtimeError,
  effects: readonly MachineEffect[] = [],
): Step {
  return {
    state: { phase: "failed", failures: from.failures, authSeq: from.authSeq, error },
    effects: [...effects, { type: "subscriptions-end", error }],
  };
}

/*
 * Failed attempts in a row before the next: none once a connection stayed
 * open `stableMs`. Counted from the first answer instead, a server that
 * admits a connection and drops it at once kept every reconnect at the
 * shortest wait.
 */
function failuresAfter(state: MachineState, ctx: MachineContext): number {
  const stable = "openedAt" in state && ctx.now - state.openedAt >= ctx.stableMs;
  return stable ? 0 : state.failures + 1;
}

/** Wait to reconnect, as long as the backoff says, or not sooner than the server asked. */
export function schedule(
  from: MachineState,
  ctx: MachineContext,
  cause: ReconnectCause,
  effects: readonly MachineEffect[],
  hintMs?: number,
): Step {
  const failures = failuresAfter(from, ctx);
  const retryIn = ctx.delay(Math.max(failures - 1, 0), hintMs);
  return {
    state: {
      phase: "reconnecting",
      failures,
      authSeq: from.authSeq,
      refusal: from.refusal,
      retryIn,
      cause,
      deadline: { ms: retryIn, fires: "retry" },
    },
    effects,
  };
}

/**
 * The socket closed, or the server said it is closing it: what the code
 * means, by the protocol's table — reconnect, ask for the credentials again,
 * give up, or end as the server ended it.
 */
export function onClosed(
  state: MachineState,
  ctx: MachineContext,
  closure: SocketClosure,
  announced: boolean,
  error: unknown,
): Step {
  const live = state.phase === "open" || state.phase === "reauthenticating";
  const before: MachineEffect[] = [
    ...(announced ? [{ type: "drop-socket", code: 1000, reason: "" } as const] : []),
    ...(live ? [{ type: "unwatch" } as const] : []),
  ];
  const disposition = classifyClose(closure);
  switch (disposition.action) {
    case "finish":
      return {
        state: { phase: "closed", by: "server", failures: 0, authSeq: state.authSeq },
        effects: [...before, { type: "subscriptions-end" }],
      };
    case "stop":
      return fail(state, disposition.error, before);
    case "reauthenticate": {
      const fingerprint = "fingerprint" in state ? state.fingerprint : undefined;
      if (state.refusal?.retried || fingerprint === undefined) {
        return fail(state, disposition.error, before);
      }
      const refusal = { fingerprint, error: disposition.error, retried: false };
      return connect(state, ctx, state.failures, refusal, [
        ...before,
        { type: "subscriptions-wait" },
      ]);
    }
    case "retry": {
      const opened = state.phase !== "connecting";
      const cause: ReconnectCause = {
        kind: "closed",
        code: closure.code,
        reason: closure.reason,
        opened,
        ...(error !== undefined && { error }),
      };
      const told = closure.code === MESSAGE_TOO_BIG ? tooBig(closure) : undefined;
      return schedule(
        state,
        ctx,
        cause,
        [...before, { type: "subscriptions-wait", error: told }],
        disposition.afterMs,
      );
    }
  }
}

/* A socket closed over one message larger than the server reads: that one is lost, and each subscription hears so. */
function tooBig(closure: SocketClosure): RealtimeError {
  return fromErrorCode(MESSAGE_TOO_BIG, closure.reason || "A message was too large for the server");
}
