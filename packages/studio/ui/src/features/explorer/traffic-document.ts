import { post } from "@/lib/api-client";
import { isPlainObject } from "@/socket/is-plain-object";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";

/** An OpenAPI document Studio read from a source's recorded calls. */
export interface TrafficDocument {
  text: string;
  /** How many endpoints it holds. */
  endpoints: number;
  /** What the calls held that the document could not: a stream's calls, calls with no answer. */
  leftOut: unknown;
}

/**
 * Have Studio read an OpenAPI document from a source's calls this page
 * recorded — each route with its parameters, the schemas of what it was
 * sent and answered — and nothing from another source's.
 *
 * @param source - The source the calls were made to
 * @returns The document as text, with how many endpoints it holds and what it left out
 * @throws {Error} When Studio read no document
 * @example
 * ```ts
 * const { text, endpoints } = await readTrafficDocument("billing");
 * ```
 */
export async function readTrafficDocument(source: string): Promise<TrafficDocument> {
  const calls = useStudioStore
    .getState()
    .requests.filter((r) => r.source === source && r.purpose === undefined)
    .map(callOf);
  const answer = await post<unknown>("/api/apis/traffic-spec", { source, calls });
  if (!isPlainObject(answer) || typeof answer.text !== "string")
    throw new Error("Studio read no document");
  return {
    text: answer.text,
    endpoints: typeof answer.endpoints === "number" ? answer.endpoints : 0,
    leftOut: answer.leftOut,
  };
}

function callOf(r: RequestEntry): Record<string, unknown> {
  return {
    group: r.group ?? "",
    method: r.method,
    httpMethod: r.httpMethod,
    url: r.url,
    variables: r.variables,
    status: r.statusCode,
    data: r.data,
    dataCut: r.dataCutFrom !== undefined,
    transport: r.transport ?? "http",
  };
}
