import { isRecord } from "../is-record";
import type { CallLimits } from "./call-limits";
import type { Connection } from "./connection";
import { destructiveGate } from "./destructive-gate";
import type { Era } from "./era";
import { ERROR_CODE } from "./json-rpc";
import { McpProtocolError } from "./protocol-error";
import type { Refusal, ToolCaller } from "./served-tool";
import type { McpServerOptions } from "./server-options";
import { shownOutputSchema, structuredOutputOf } from "./tool-definition";
import { limitedCall, notNow } from "./tool-limit";
import { toolResult } from "./tool-result";
import { visibleTool } from "./visible-tools";

/**
 * Answer `tools/call`: find the tool the caller may see, refuse a call over
 * its limit, confirm a destructive one with a person — once its limit would
 * take it — run it, and write what came of it.
 *
 * @param params - The request's params: `name`, `arguments`, and on a retry
 *   `inputResponses` and `requestState`
 * @param era - The revision the request is served under
 * @param connection - What it arrived over
 * @param signal - Fires when the client stops waiting
 * @param options - The server's tools and rules
 * @param limits - The calls its limited tools took, per caller
 * @returns The result: the call's, or a question for a person
 * @throws McpProtocolError `-32602` for an unknown tool or arguments that are no
 *   object, `-32021` when a confirmation is needed and the client cannot ask one
 * @example
 * ```ts
 * await callTool({ name: "orders_get", arguments: { id: "7" } }, era, connection, signal, options, limits);
 * ```
 */
export async function callTool(
  params: Record<string, unknown>,
  era: Era,
  connection: Connection,
  signal: AbortSignal,
  options: McpServerOptions,
  limits: CallLimits,
): Promise<Record<string, unknown>> {
  const tool =
    typeof params.name === "string"
      ? visibleTool(options, params.name, connection.principal)
      : undefined;
  if (tool === undefined) {
    throw new McpProtocolError(ERROR_CODE.invalidParams, `Unknown tool: ${String(params.name)}`);
  }
  const args = params.arguments ?? {};
  if (!isRecord(args))
    throw new McpProtocolError(ERROR_CODE.invalidParams, "A tool's arguments are an object");
  const caller: ToolCaller = { principal: connection.principal, client: era.client, signal };
  /* A refusal is told to the agent, and to whoever records the tool's calls. */
  const refuse = (kind: Refusal["kind"], message: string) => {
    tool.refused?.(args, caller, { kind, message });
    return { content: [{ type: "text", text: message }], isError: true };
  };
  const limited = limitedCall(tool, limits, options, connection.principal);
  if (tool.access === "destructive" && !options.allowDestructive) {
    const problem = await tool.check?.(args);
    if (problem !== undefined) return refuse("validation", problem);
    /* No person is asked about a call its limit would refuse. */
    const waiting = limited?.waitOf() ?? 0;
    if (waiting > 0) return refuse("limited", notNow(tool, waiting));
    const gate = await destructiveGate({
      tool,
      args,
      params,
      era,
      connection,
      signal,
      options,
      refuse,
    });
    if (gate !== "run") return gate;
  }
  const wait = limited?.take() ?? 0;
  if (wait > 0) return refuse("limited", notNow(tool, wait));
  const outcome = await tool.run(args, caller);
  const structured = structuredOutputOf(era.version);
  return toolResult(
    outcome,
    shownOutputSchema(tool, structured),
    structured,
    options.maxResultChars,
  );
}
