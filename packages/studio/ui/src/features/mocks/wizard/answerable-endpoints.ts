import type { ScannedEndpoint, ScannedSource } from "@/features/apis/types-generate";

/** An endpoint a mock can answer or leave to the server, as the wizard lists it. */
export interface AnswerableEndpoint {
  /** How the mock names it: `group.method`, or the method alone outside any group. */
  name: string;
  /** Its own name, shown under its group. */
  method: string;
  httpMethod: string;
}

/** A group of answerable endpoints; `""` for those outside any group. */
export interface AnswerableGroup {
  group: string;
  endpoints: AnswerableEndpoint[];
}

/**
 * The endpoints of a source a mock may answer or leave to its server: the
 * HTTP ones, by group. A stream or a channel the mock always answers, so it
 * is not offered.
 *
 * @param source - The source, as Studio scanned it
 * @returns Its HTTP endpoints by group, groups without any left out
 * @example
 * ```ts
 * answerableEndpoints(shop)[0]; // → { group: "orders", endpoints: [{ name: "orders.refund", method: "refund", httpMethod: "POST" }] }
 * ```
 */
export function answerableEndpoints(source: ScannedSource | undefined): AnswerableGroup[] {
  if (!source) return [];
  const groups = source.groups.map((group) => groupOf(group.name, group.endpoints));
  if (source.inlineEndpoints?.length) groups.push(groupOf("", source.inlineEndpoints));
  return groups.filter((group) => group.endpoints.length > 0);
}

function groupOf(group: string, endpoints: readonly ScannedEndpoint[]): AnswerableGroup {
  return {
    group,
    endpoints: endpoints
      .filter((endpoint) => endpoint.analysis.transport === undefined)
      .map((endpoint) => ({
        name: group ? `${group}.${endpoint.name}` : endpoint.name,
        method: endpoint.name,
        httpMethod: endpoint.analysis.httpMethod.toUpperCase(),
      })),
  };
}
