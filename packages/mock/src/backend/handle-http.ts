import { HTTPError } from "@noverax/courier";
import { createFaultError, pickFault, shouldFail } from "../network/failure";
import type { MockHistoryEntry, MockRequestContext, NetworkConfig } from "../types";
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
  const start = Date.now();

  if (network && shouldFail(network)) {
    return throwNetworkFault(group, method, variables, network, history, start);
  }

  if (!handler) {
    return throwMissingHandler(group, method, variables, params.getScenarioState(), history, start);
  }

  const delay = resolveHandlerDelay(handler, network);
  if (delay) await sleep(delay);

  const ctx: MockRequestContext = {
    variables,
    headers: new Headers(),
    callIndex: params.index,
    scenarioState: params.getScenarioState(),
  };

  if (handler.isError) {
    return throwHandlerError(group, method, variables, handler, ctx, history, start);
  }

  return executeSuccess(group, method, variables, handler, ctx, params, history, start);
}

function throwNetworkFault(
  group: string,
  method: string,
  variables: unknown,
  network: NetworkConfig,
  history: MockHistoryEntry[],
  start: number,
): never {
  const fault = pickFault(network);
  const { status, message } = createFaultError(fault);
  const error = new HTTPError({ status, headers: new Headers(), data: { message } });
  history.push({
    group,
    method,
    variables,
    error,
    mocked: true,
    duration: Date.now() - start,
    timestamp: start,
  });
  throw error;
}

function throwMissingHandler(
  group: string,
  method: string,
  variables: unknown,
  scenarioState: string,
  history: MockHistoryEntry[],
  start: number,
): never {
  const error = new Error(
    `[courier-mock] No mock for "${group}.${method}" in state "${scenarioState}". ` +
      `Call mock("${group}", "${method}").resolves(data) first.`,
  );
  history.push({
    group,
    method,
    variables,
    error,
    mocked: false,
    duration: Date.now() - start,
    timestamp: start,
  });
  throw error;
}

function throwHandlerError(
  group: string,
  method: string,
  variables: unknown,
  handler: ResolvedHandler,
  ctx: MockRequestContext,
  history: MockHistoryEntry[],
  start: number,
): never {
  const data = handler.fn(ctx);
  const error = new HTTPError({
    status: handler.status,
    headers: new Headers(handler.headers),
    data,
  });
  history.push({
    group,
    method,
    variables,
    error,
    mocked: true,
    result: { status: handler.status, data, headers: handler.headers },
    duration: Date.now() - start,
    timestamp: start,
  });
  throw error;
}

async function executeSuccess(
  group: string,
  method: string,
  variables: unknown,
  handler: ResolvedHandler,
  ctx: MockRequestContext,
  params: HandleHTTPParams,
  history: MockHistoryEntry[],
  start: number,
): Promise<unknown> {
  const data = await handler.fn(ctx);
  if (handler.newState) params.setScenarioState(handler.newState);

  history.push({
    group,
    method,
    variables,
    mocked: true,
    result: { status: handler.status, data, headers: handler.headers },
    duration: Date.now() - start,
    timestamp: start,
  });
  return data;
}
