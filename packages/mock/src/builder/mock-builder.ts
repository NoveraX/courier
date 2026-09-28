import type { SSEEvent } from "@noverax/courier/realtime";
import type {
  EnhancedMockBuilder,
  MockChannelFn,
  MockHandlerFn,
  MockStreamFn,
  ResolvedHandler,
} from "../types";
import type { OnRegister } from "./builder-target";
import { createBuilderTarget } from "./builder-target";
import { channelWith, streamOf, streamWith } from "./realtime-handlers";
import { sequenceSteps } from "./sequence-steps";

export type { OnRegister } from "./builder-target";

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
 *   A chain that only decorates (`.withHeaders(h)`) keeps the existing
 *   response. A chain that answers anew — `resolves`, `returns`, `rejects`,
 *   `sequence`, `stream`, `emits`, `channel` — replaces the response and
 *   drops the existing handler's decorations, keeping only those written in
 *   the chain itself: a plain `resolves(b)` after `once().resolves(a)` used
 *   to be a one-off too, and one after `emits()` answered as a stream.
 * - **Without existing**: a new handler is registered immediately.
 *
 * A status set with `withStatus` holds whatever response method comes after
 * it; `resolves`/`returns` used to reset it to 200.
 *
 * @param onRegister Pushes a new handler onto its stack
 * @param existing   The endpoint's latest handler in the builder's layer, if any
 * @returns The builder
 * @example
 * ```ts
 * createEnhancedMockBuilder((h) => registry.set("users", "list", h)).delay(200).resolves([]);
 * ```
 */
export function createEnhancedMockBuilder<TResponse, TVariables>(
  onRegister: OnRegister,
  existing?: ResolvedHandler,
): EnhancedMockBuilder<TResponse, TVariables> {
  const target = createBuilderTarget(onRegister, existing);

  const respond = (fn: MockHandlerFn, isError = false, status?: number): void => {
    const handler = target.forResponse();
    handler.fn = fn;
    handler.status = status ?? target.explicitStatus ?? 200;
    handler.isError = isError;
    handler.nextStep = undefined;
  };

  const builder: EnhancedMockBuilder<TResponse, TVariables> = {
    resolves(data) {
      respond(() => data);
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
      respond(fn as MockHandlerFn);
      return builder;
    },

    rejects(status, data) {
      respond(() => data ?? { success: false, message: `HTTP ${status}` }, true, status);
      return builder;
    },

    once: () => decorated({ remaining: 1 }),
    times: (n) => decorated({ remaining: n }),
    delay: (ms) => decorated({ delayMs: ms }),
    withLatency: (profile) => decorated({ latency: profile }),
    inState: (state) => decorated({ requiredState: state }),
    transitionTo: (state) => decorated({ newState: state }),

    withHeaders: (headers) => decorated({ headers }),

    withStatus(status) {
      target.explicitStatus = status;
      target.forDecoration().status = status;
      return builder;
    },

    sequence(responses) {
      respond(() => undefined);
      target.forResponse().nextStep = sequenceSteps(responses);
      return builder;
    },

    stream(fn) {
      streamWith(target.forResponse(), fn as MockStreamFn);
      return builder;
    },

    emits(events) {
      return builder.stream(streamOf(events as SSEEvent[]) as MockStreamFn<TResponse, TVariables>);
    },

    channel(fn) {
      channelWith(target.forResponse(), fn as MockChannelFn);
      return builder;
    },
  };

  function decorated(
    decoration: Parameters<typeof target.decorate>[0],
  ): EnhancedMockBuilder<TResponse, TVariables> {
    target.decorate(decoration);
    return builder;
  }

  return builder;
}

/** Name what arrived, so a wrong argument reads as itself in the message. */
function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}
