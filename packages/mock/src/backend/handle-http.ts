import { pickFault, shouldFail } from "../network/failure";
import { resolveDelay } from "../network/latency";
import type { ScenarioMark } from "../scenario/scenario-state";
import type { MockHistoryEntry, MockRequestContext, NetworkConfig } from "../types";
import { oversizeOfSent, typeOfSent } from "../uploads/sent-upload";
import type { HttpCall } from "./http-outcomes";
import {
  handlerError,
  missingHandler,
  networkFault,
  recordOutcome,
  thrownByHandler,
  uploadRefused,
} from "./http-outcomes";
import { sleep } from "./resolve-delay";
import type { ResolvedHandler } from "./types";

interface HandleHTTPParams {
  group: string;
  method: string;
  /** What the call was made with: a form or raw bytes is an upload */
  sent: unknown;
  variables: unknown;
  handler: ResolvedHandler | undefined;
  index: number;
  history: MockHistoryEntry[];
  network?: NetworkConfig | undefined;
  getScenarioState: () => string;
  /** The state the handler was picked in */
  mark: ScenarioMark;
  transitionScenario: (from: ScenarioMark, to: string) => void;
}

/*
 * Fail the call as a mock server fails the same request: an upload over the
 * size limit before its body is read, then one the `interrupt` fault cuts
 * off, then a file of a type not taken, then any other fault.
 */
async function failure(call: HttpCall, sent: unknown, network: NetworkConfig | undefined) {
  const fault = network && shouldFail(network) ? pickFault(network) : undefined;
  const oversize = await oversizeOfSent(sent, network?.uploads);
  if (oversize) return uploadRefused(call, oversize);
  if (fault === "interrupt") return networkFault(call, fault);
  const type = typeOfSent(sent, network?.uploads);
  if (type) return uploadRefused(call, type);
  if (fault === undefined) return undefined;
  /* A timeout fault takes the configured timeout to fail. With none, it
     fails at once: there is no client timeout here to outlast. */
  if (fault === "timeout" && network?.timeout) await sleep(network.timeout);
  return networkFault(call, fault);
}

/** Handle HTTP mock request — resolves handler, applies delay/faults, tracks history */
export async function handleHTTP(params: HandleHTTPParams): Promise<unknown> {
  const { group, method, variables, handler, history, network } = params;
  const call: HttpCall = { group, method, variables, history, start: Date.now() };

  const failed = await failure(call, params.sent, network);
  if (failed) throw failed;
  if (!handler) throw missingHandler(call, params.getScenarioState());

  const delay = resolveDelay(handler, network);
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

  if (handler.newState) params.transitionScenario(params.mark, handler.newState);
  recordOutcome(call, {
    mocked: true,
    result: { status: handler.status, data, headers: handler.headers },
  });
  return data;
}
