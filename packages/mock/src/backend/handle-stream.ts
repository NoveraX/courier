import { createMockSSESubscription } from "@noverax/courier/testing";
import type { MockHistoryEntry, MockRequestContext } from "../types";
import type { ResolvedHandler } from "./types";

/** Handle SSE stream request — creates mock subscription from stream function */
export function handleStream(
  group: string,
  method: string,
  variables: unknown,
  handler: ResolvedHandler,
  index: number,
  history: MockHistoryEntry[],
  getScenarioState: () => string,
): unknown {
  const streamFn = handler.streamFn;
  if (!streamFn) {
    throw new Error(`[courier-mock] SSE handler missing streamFn for "${group}.${method}"`);
  }

  const ctx: MockRequestContext = {
    variables,
    headers: new Headers(),
    callIndex: index,
    scenarioState: getScenarioState(),
  };

  history.push({
    group,
    method,
    variables,
    mocked: true,
    stream: true,
    duration: 0,
    timestamp: Date.now(),
  });

  return createMockSSESubscription(() => streamFn(ctx), handler.delayMs);
}
