import { createMockWSChannel } from "@noverax/courier/testing";
import type { MockHistoryEntry, MockRequestContext } from "../types";
import type { ResolvedHandler } from "./types";

/** Handle WS channel request — creates mock channel from channel handlers */
export function handleChannel(
  group: string,
  method: string,
  variables: unknown,
  handler: ResolvedHandler,
  index: number,
  history: MockHistoryEntry[],
  getScenarioState: () => string,
): unknown {
  const channelFn = handler.channelFn;
  if (!channelFn) {
    throw new Error(`[courier-mock] WS handler missing channelFn for "${group}.${method}"`);
  }

  const ctx: MockRequestContext = {
    variables,
    headers: new Headers(),
    callIndex: index,
    scenarioState: getScenarioState(),
  };

  const handlers = channelFn(ctx);

  history.push({
    group,
    method,
    variables,
    mocked: true,
    channel: true,
    duration: 0,
    timestamp: Date.now(),
  });

  return createMockWSChannel(handlers, variables, handler.delayMs);
}
