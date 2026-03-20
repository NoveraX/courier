import type { EnhancedMockBuilder, MockHandlerFn, ResolvedHandler } from "../types";

/** Callback invoked when the builder finalizes a handler */
export type OnRegister = (handler: ResolvedHandler) => void;

/** Create a fluent EnhancedMockBuilder that mutates a handler in place */
export function createEnhancedMockBuilder<TResponse, TVariables>(
  onRegister: OnRegister,
): EnhancedMockBuilder<TResponse, TVariables> {
  const handler: ResolvedHandler = {
    fn: () => undefined,
    status: 200,
    isError: false,
  };

  // Register immediately — mutations update the same object reference
  onRegister(handler);

  const builder: EnhancedMockBuilder<TResponse, TVariables> = {
    resolves(data) {
      handler.fn = () => data;
      handler.isError = false;
      return builder;
    },

    returns(fn) {
      handler.fn = fn as MockHandlerFn;
      handler.isError = false;
      return builder;
    },

    rejects(status, data) {
      handler.status = status;
      handler.fn = () => data ?? { success: false, message: `HTTP ${status}` };
      handler.isError = true;
      return builder;
    },

    once() {
      handler.remaining = 1;
      return builder;
    },

    times(n) {
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
      handler.requiredState = state;
      return builder;
    },

    transitionTo(state) {
      handler.newState = state;
      return builder;
    },

    sequence(responses) {
      let index = 0;
      handler.fn = () => {
        const current =
          index < responses.length ? responses[index] : responses[responses.length - 1];
        index++;

        if (!current) return undefined;
        if (typeof current === "object" && current !== null && "data" in current) {
          return (current as { data: unknown }).data;
        }
        return current;
      };
      handler.isError = false;
      return builder;
    },
  };

  return builder;
}
