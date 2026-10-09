import type { CallLimits } from "./call-limits";
import { limitText, waitText } from "./limit-text";
import type { ServedTool } from "./served-tool";
import type { McpServerOptions } from "./server-options";

/** One call's place in its tool's limit: how long it would wait, and taking it. */
export interface LimitedCall {
  /** How long the caller waits before the tool takes its call; `0` when it may call now. */
  waitOf(): number;
  /** Count the call, `0`; or how long the caller waits instead. */
  take(): number;
}

/**
 * Where a call stands against its tool's limit, counted for the caller the
 * server tells apart — `limitPer` of the principal, one count when the server
 * names none. `undefined` for a tool without a limit.
 *
 * @param tool - The tool called
 * @param limits - The server's counts
 * @param options - The server's rules: `limitPer`
 * @param principal - Who the server let in
 * @returns The call's place, or `undefined`
 * @example
 * ```ts
 * const limited = limitedCall(tool, limits, options, connection.principal);
 * if ((limited?.take() ?? 0) > 0) return refuse("limited", notNow(tool, wait));
 * ```
 */
export function limitedCall(
  tool: ServedTool,
  limits: CallLimits,
  options: Pick<McpServerOptions, "limitPer">,
  principal: unknown,
): LimitedCall | undefined {
  const { limit } = tool;
  if (limit === undefined) return undefined;
  const caller = options.limitPer?.(principal) ?? "";
  return {
    waitOf: () => limits.waitOf(tool.name, limit, caller),
    take: () => limits.take(tool.name, limit, caller),
  };
}

/**
 * Why a call over its tool's limit did not run, and when the caller may call again.
 *
 * @param tool - The tool, which has a limit
 * @param wait - How long the caller waits, in milliseconds
 * @returns The sentence the tool result carries
 * @example
 * ```ts
 * notNow(tool, 37_200); // "Not run: orders_refund takes 3 calls a minute, … in 38 s."
 * ```
 */
export function notNow(tool: ServedTool, wait: number): string {
  const allowed = tool.limit ? limitText(tool.limit) : "no more calls now";
  return `Not run: ${tool.name} takes ${allowed} from each caller, and this caller made them; it may call again in ${waitText(wait)}.`;
}
