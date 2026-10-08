import { createLogger } from "@noverax/courier";

import { isRecord } from "../is-record";
import type { AgentTool } from "../tools/agent-tool";
import { CONFIRM_INPUT, canAsk, confirmationParams, decisionOf, notRun } from "./confirmation";
import type { Connection } from "./connection";
import type { Era } from "./era";
import { ERROR_CODE } from "./json-rpc";
import { McpProtocolError } from "./protocol-error";
import type { RefusalKind } from "./report-refusal";
import type { McpServerOptions } from "./server-options";

const log = createLogger("MCP");

/** What the gate decides: run the call, or answer with this result instead. */
type Gate = "run" | Record<string, unknown>;

/** A destructive call at the gate: what it is, what it came over, and how a refusal is answered. */
export interface GatedCall {
  readonly tool: AgentTool;
  readonly args: Record<string, unknown>;
  readonly params: Record<string, unknown>;
  readonly era: Era;
  readonly connection: Connection;
  readonly signal: AbortSignal;
  readonly options: McpServerOptions;
  /** Answers with a refusal, and shows it in Studio. */
  readonly refuse: (kind: RefusalKind, message: string) => Record<string, unknown>;
}

/**
 * Let a destructive call through once a person has confirmed it.
 *
 * Under 2026-07-28 the question goes back inside the result, and the client
 * calls again with the answer and the state it was given. Under the
 * `initialize` handshake a stdio client is asked directly, as a request of
 * its own. A client that can be asked neither way is refused: under
 * 2026-07-28 with the protocol's error for a missing capability, otherwise
 * with a result that says how the operator lifts the rule.
 *
 * @param call - The call at the gate
 * @returns `"run"`, or the result to answer with instead: a question, or a refusal
 * @throws McpProtocolError `-32602` for a state this server never gave,
 *   `-32021` for a 2026-07-28 client that declares no elicitation
 * @example
 * ```ts
 * const gate = await destructiveGate({ tool, args, params, era, connection, signal, options, refuse });
 * if (gate !== "run") return gate;
 * ```
 */
export async function destructiveGate(call: GatedCall): Promise<Gate> {
  const { tool, args, era, connection, signal, options } = call;
  if (era.kind === "modern") return confirmedByRetry(call);
  if (connection.ask === undefined || !canAsk(era.capabilities)) {
    return call.refuse("aborted", notRun(tool, "unasked", options.transport));
  }
  const answer = await connection
    .ask("elicitation/create", confirmationParams(tool, args, era.version === "2025-11-25"), signal)
    .catch((error: unknown) => {
      if (signal.aborted) throw error;
      log.warn(`The confirmation for ${tool.name} failed; the call does not run`, error);
      return undefined;
    });
  const decision = decisionOf(answer);
  return decision === "accept"
    ? "run"
    : call.refuse("aborted", notRun(tool, decision ?? "unanswered", options.transport));
}

async function confirmedByRetry(call: GatedCall): Promise<Gate> {
  const { tool, args, params, era, options } = call;
  if (params.requestState !== undefined) {
    const problem = await options.states.open(params.requestState, tool.name, args);
    if (problem === "forged") {
      throw new McpProtocolError(
        ERROR_CODE.invalidParams,
        "The requestState is not one this server gave for this call: call the tool again without it",
      );
    }
    const responses = isRecord(params.inputResponses) ? params.inputResponses : {};
    const decision = problem === undefined ? decisionOf(responses[CONFIRM_INPUT]) : undefined;
    if (decision === "accept") return "run";
    if (decision !== undefined)
      return call.refuse("aborted", notRun(tool, decision, options.transport));
  }
  if (!canAsk(era.capabilities)) {
    const message = `${tool.name} cannot be undone, so a person confirms each call, and this request declares no elicitation`;
    call.refuse("aborted", message);
    throw new McpProtocolError(ERROR_CODE.missingCapability, message, {
      requiredCapabilities: { elicitation: { form: {} } },
    });
  }
  return {
    resultType: "input_required",
    inputRequests: {
      [CONFIRM_INPUT]: {
        method: "elicitation/create",
        params: confirmationParams(tool, args, true),
      },
    },
    requestState: await options.states.seal(tool.name, args),
  };
}
