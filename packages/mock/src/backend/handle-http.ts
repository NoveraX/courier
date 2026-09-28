import { shouldFail } from "../network/failure";
import type { MockHistoryEntry, MockRequestContext, NetworkConfig } from "../types";
import type { HttpCall } from "./http-outcomes";
import {
  handlerError,
  missingHandler,
  networkFault,
  recordOutcome,
  thrownByHandler,
} from "./http-outcomes";
import { resolveHandlerDelay, sleep } from "./resolve-delay";
import type { ResolvedHandler } from "./types";

interface HandleHTTPParams {
  group: string;
  method: string;
  variables: unknown;
  handler: ResolvedHandler | undefined;
  index: number;
  history: MockHistoryEntry[];
  network?: NetworkConfig;
  getScenarioState: () => string;
  setScenarioState: (state: string) => void;
}

/** Handle HTTP mock request — resolves handler, applies delay/faults, tracks history */
export async function handleHTTP(params: HandleHTTPParams): Promise<unknown> {
  const { group, method, variables, handler, history, network } = params;
  const call: HttpCall = { group, method, variables, history, start: Date.now() };

  if (network && shouldFail(network)) throw networkFault(call, network);
  if (!handler) throw missingHandler(call, params.getScenarioState());

  const delay = resolveHandlerDelay(handler, network);
  if (delay) await sleep(delay);

  const ctx: MockRequestContext = {
    variables,
    headers: new Headers(),
    callIndex: params.index,
    scenarioState: params.getScenarioState(),
  };

  /* Run the handler before reading its error flag and status: a sequence
     sets both for the entry it answers with, as the call runs. */
  let data: unknown;
  try {
    data = await handler.fn(ctx);
  } catch (thrown) {
    throw thrownByHandler(call, thrown);
  }
  if (handler.isError) throw handlerError(call, handler, data);

  if (handler.newState) params.setScenarioState(handler.newState);
  recordOutcome(call, {
    mocked: true,
    result: { status: handler.status, data, headers: handler.headers },
  });
  return data;
}
