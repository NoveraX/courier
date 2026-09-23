import type { SSEEvent } from "@noverax/courier/realtime";
import type {
  EnhancedMockBuilder,
  MockChannelFn,
  MockHandlerFn,
  MockStreamFn,
  ResolvedHandler,
  SequenceEntry,
} from "../types";
import { channelWith, streamOf, streamWith } from "./realtime-handlers";
import { sequenceFn } from "./sequence-fn";

/** Callback invoked when a NEW handler needs to be pushed onto the stack */
export type OnRegister = (handler: ResolvedHandler) => void;

/**
 * Create a fluent EnhancedMockBuilder.
 *
 * Two modes of operation:
 * - **With existing handler** (an auto-CRUD route, say): the first method
 *   called pushes a copy of it — its response and decorations — and every
 *   method then works on the copy, in any order. Decorators used to edit the
 *   existing handler itself, so one written before the response method
 *   (`.delay(400).resolves(x)`) was lost from the new handler and stamped
 *   onto the auto-CRUD one for good.
 * - **Without existing**: a new handler is registered immediately.
 *
 * A status set with `withStatus` holds whatever response method comes after
 * it; `resolves`/`returns` used to reset it to 200.
 */
export function createEnhancedMockBuilder<TResponse, TVariables>(
  onRegister: OnRegister,
  existing?: ResolvedHandler,
): EnhancedMockBuilder<TResponse, TVariables> {
  // If no existing handler, create and register a new one immediately
  // (backward compat: mutations update the same object reference)
  let handler: ResolvedHandler = existing ?? {
    fn: () => undefined,
    status: 200,
    isError: false,
  };

  if (!existing) {
    onRegister(handler);
  }

  let explicitStatus: number | undefined;

  /** Switch to a copy of the existing handler and push it onto the stack */
  function ensureOwnHandler(): void {
    if (handler === existing) {
      handler = { ...existing, ...(existing.headers && { headers: { ...existing.headers } }) };
      onRegister(handler);
    }
  }

  const builder: EnhancedMockBuilder<TResponse, TVariables> = {
    resolves(data) {
      ensureOwnHandler();
      handler.fn = () => data;
      handler.status = explicitStatus ?? 200;
      handler.isError = false;
      return builder;
    },

    returns(fn) {
      /* `returns` takes a function of the request; static data goes to
         `resolves`. Mixing them up used to survive until the endpoint was
         called and then answer 500 with "handler.fn is not a function",
         which names nothing the caller can act on. */
      if (typeof fn !== "function") {
        throw new TypeError(
          `returns() expects a function of the request context, received ${describeValue(fn)}. ` +
            "Use resolves() to answer with static data.",
        );
      }
      ensureOwnHandler();
      handler.fn = fn as MockHandlerFn;
      handler.status = explicitStatus ?? 200;
      handler.isError = false;
      return builder;
    },

    rejects(status, data) {
      ensureOwnHandler();
      handler.status = status;
      handler.fn = () => data ?? { success: false, message: `HTTP ${status}` };
      handler.isError = true;
      return builder;
    },

    once() {
      ensureOwnHandler();
      handler.remaining = 1;
      return builder;
    },

    times(n) {
      ensureOwnHandler();
      handler.remaining = n;
      return builder;
    },

    delay(ms) {
      ensureOwnHandler();
      handler.delayMs = ms;
      return builder;
    },

    withLatency(profile) {
      ensureOwnHandler();
      handler.latency = profile;
      return builder;
    },

    withHeaders(headers) {
      ensureOwnHandler();
      handler.headers = { ...handler.headers, ...headers };
      return builder;
    },

    withStatus(status) {
      ensureOwnHandler();
      explicitStatus = status;
      handler.status = status;
      return builder;
    },

    inState(state) {
      ensureOwnHandler();
      handler.requiredState = state;
      return builder;
    },

    transitionTo(state) {
      ensureOwnHandler();
      handler.newState = state;
      return builder;
    },

    sequence(responses) {
      ensureOwnHandler();
      handler.fn = sequenceFn(handler, responses as SequenceEntry<unknown>[]);
      handler.isError = false;
      return builder;
    },

    stream(fn) {
      ensureOwnHandler();
      streamWith(handler, fn as MockStreamFn);
      return builder;
    },

    emits(events) {
      return builder.stream(streamOf(events as SSEEvent[]) as MockStreamFn<TResponse, TVariables>);
    },

    channel(fn) {
      ensureOwnHandler();
      channelWith(handler, fn as MockChannelFn);
      return builder;
    },
  };

  return builder;
}

/** Name what arrived, so a wrong argument reads as itself in the message. */
function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}
