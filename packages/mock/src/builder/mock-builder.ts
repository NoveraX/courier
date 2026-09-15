import type { SSEEvent } from "@noverax/courier/realtime";
import type {
  EnhancedMockBuilder,
  MockChannelFn,
  MockHandlerFn,
  MockStreamFn,
  ResolvedHandler,
  SequenceEntry,
} from "../types";

/** Callback invoked when a NEW handler needs to be pushed onto the stack */
export type OnRegister = (handler: ResolvedHandler) => void;

/**
 * Create a fluent EnhancedMockBuilder.
 *
 * Two modes of operation:
 * - **With existing handler**: decorator methods (withLatency, withHeaders, delay, withStatus)
 *   mutate the existing handler in-place — no new handler is pushed.
 *   Response-defining methods (resolves, returns, rejects, sequence) create a new handler.
 * - **Without existing**: a new handler is registered immediately (original behavior).
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

  /** Switch to a fresh handler, push it onto the stack, apply any pending decorators */
  function ensureOwnHandler(): void {
    if (handler === existing) {
      handler = { fn: handler.fn, status: handler.status, isError: handler.isError };
      onRegister(handler);
    }
  }

  const builder: EnhancedMockBuilder<TResponse, TVariables> = {
    resolves(data) {
      ensureOwnHandler();
      handler.fn = () => data;
      handler.status = 200;
      handler.isError = false;
      return builder;
    },

    returns(fn) {
      ensureOwnHandler();
      handler.fn = fn as MockHandlerFn;
      handler.status = 200;
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
      handler.delayMs = ms;
      return builder;
    },

    withLatency(profile) {
      handler.latency = profile;
      return builder;
    },

    withHeaders(headers) {
      handler.headers = { ...handler.headers, ...headers };
      return builder;
    },

    withStatus(status) {
      handler.status = status;
      return builder;
    },

    inState(state) {
      ensureOwnHandler();
      handler.requiredState = state;
      return builder;
    },

    transitionTo(state) {
      handler.newState = state;
      return builder;
    },

    sequence(responses) {
      ensureOwnHandler();
      let index = 0;
      handler.fn = () => {
        const current: SequenceEntry<unknown> =
          index < responses.length ? responses[index] : responses[responses.length - 1];
        index++;

        if (!current) return undefined;

        if (typeof current === "object" && current !== null) {
          if ("error" in current && current.error === true) {
            const entry = current as { error: true; status: number; data?: unknown };
            // Signal error by throwing — route-generator catches and returns error response
            handler.isError = true;
            handler.status = entry.status;
            return entry.data ?? { success: false, message: `HTTP ${entry.status}` };
          }
          if ("data" in current) {
            handler.isError = false;
            handler.status = 200;
            return (current as { data: unknown }).data;
          }
        }

        handler.isError = false;
        handler.status = 200;
        return current;
      };
      handler.isError = false;
      return builder;
    },

    stream(fn) {
      ensureOwnHandler();
      handler.transport = "sse";
      handler.streamFn = fn as MockStreamFn;
      handler.fn = () => undefined;
      handler.isError = false;
      return builder;
    },

    emits(events) {
      const gen: MockStreamFn = async function* () {
        for (const event of events) yield event as SSEEvent;
      };
      return builder.stream(gen as MockStreamFn<TResponse, TVariables>);
    },

    channel(fn) {
      ensureOwnHandler();
      handler.transport = "ws";
      handler.channelFn = fn as MockChannelFn;
      handler.fn = () => undefined;
      handler.isError = false;
      return builder;
    },
  };

  return builder;
}
