import { isPlainObject } from "@/socket/is-plain-object";
import type { RequestAgent } from "./types";

const ACCESS: ReadonlySet<string> = new Set(["read", "write", "destructive"]);

/**
 * The agent a request ran for, from an event or a saved session — kept only
 * when it is in the shape the runtime gives it.
 *
 * @param value - What the payload holds under `agent`
 * @returns The agent, or `undefined` for a call an application made itself
 * @example
 * ```ts
 * readAgent({ tool: "orders_cancel", access: "destructive", client: "code-editor 2.1.0" });
 * ```
 */
export function readAgent(value: unknown): RequestAgent | undefined {
  if (!isPlainObject(value)) return undefined;
  const { tool, access, client } = value;
  if (typeof tool !== "string" || typeof access !== "string" || !ACCESS.has(access))
    return undefined;
  return {
    tool,
    access: access as RequestAgent["access"],
    ...(typeof client === "string" && { client }),
  };
}
