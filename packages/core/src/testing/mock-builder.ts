import type { MockBuilder } from "./types";

export type MockHandler = {
  resolver?: (variables?: unknown) => unknown | Promise<unknown>;
  data?: unknown;
  status: number;
  isError: boolean;
  remaining?: number;
  delayMs?: number;
};

/** Create a fluent MockBuilder that mutates the given handler in place */
export function createMockBuilder(handler: MockHandler): MockBuilder<unknown> {
  const builder: MockBuilder<unknown> = {
    resolves(data: unknown) {
      handler.data = data;
      handler.isError = false;
      handler.resolver = undefined;
      return builder;
    },
    returns(fn: (variables?: unknown) => unknown | Promise<unknown>) {
      handler.resolver = fn;
      handler.isError = false;
      handler.data = undefined;
      return builder;
    },
    rejects(status: number, data?: unknown) {
      handler.status = status;
      handler.data = data ?? { success: false, message: `HTTP ${status}` };
      handler.isError = true;
      handler.resolver = undefined;
      return builder;
    },
    once() {
      handler.remaining = 1;
      return builder;
    },
    times(n: number) {
      handler.remaining = n;
      return builder;
    },
    delay(ms: number) {
      handler.delayMs = ms;
      return builder;
    },
  };

  return builder;
}
