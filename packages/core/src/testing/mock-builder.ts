import type { ChannelHandlers, SSEEvent } from "../realtime/types";
import type { MockBuilder, StreamGenerator } from "./types";

export type MockHandler = {
  resolver?: (variables: unknown) => unknown | Promise<unknown>;
  streamFn?: StreamGenerator<unknown>;
  channelHandlers?: ChannelHandlers<unknown, unknown>;
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
      handler.streamFn = undefined;
      return builder;
    },
    returns(fn: (variables: unknown) => unknown | Promise<unknown>) {
      handler.resolver = fn;
      handler.isError = false;
      handler.data = undefined;
      handler.streamFn = undefined;
      return builder;
    },
    rejects(status: number, data?: unknown) {
      handler.status = status;
      handler.data = data ?? { success: false, message: `HTTP ${status}` };
      handler.isError = true;
      handler.resolver = undefined;
      handler.streamFn = undefined;
      return builder;
    },
    stream(fn: () => AsyncGenerator<SSEEvent<unknown>, void, unknown>) {
      handler.streamFn = fn;
      handler.isError = false;
      handler.data = undefined;
      handler.resolver = undefined;
      handler.channelHandlers = undefined;
      return builder;
    },
    channel(handlers: ChannelHandlers<unknown, unknown>) {
      handler.channelHandlers = handlers;
      handler.isError = false;
      handler.data = undefined;
      handler.resolver = undefined;
      handler.streamFn = undefined;
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
