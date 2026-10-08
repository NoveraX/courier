import { toast } from "sonner";

import { useImportRequest } from "@/features/apis/import-request";
import { post } from "@/lib/api-client";
import { isPlainObject } from "@/socket/is-plain-object";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";

/**
 * Read an OpenAPI document from a source's recorded calls and hand it to
 * the import wizard, which shows the code it writes before writing it and
 * declares the source in courier.config — so a source the app defines in
 * its own code becomes a typed, declared one.
 *
 * @param source - The source known only by its traffic
 * @returns Whether the wizard was asked to open
 * @example
 * ```ts
 * if (await declareFromTraffic("billing")) void navigate({ to: "/apis" });
 * ```
 */
export async function declareFromTraffic(source: string): Promise<boolean> {
  const calls = useStudioStore
    .getState()
    .requests.filter((r) => r.source === source && r.purpose === undefined)
    .map(callOf);
  try {
    const answer = await post<unknown>("/api/apis/traffic-spec", { source, calls });
    if (!isPlainObject(answer) || typeof answer.text !== "string")
      throw new Error("Studio read no document");
    if (answer.endpoints === 0) {
      toast.error(`No call of ${source} had an answer and an address to read an endpoint from`);
      return false;
    }
    useImportRequest.setState({ request: { content: answer.text } });
    const leftOut = leftOutText(answer.leftOut);
    if (leftOut) toast.info(`Read ${source} from its traffic. Left out: ${leftOut}.`);
    return true;
  } catch (error) {
    toast.error(
      `Could not read ${source} from its traffic: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
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

/* What the document could not hold, said once the wizard opens. */
function leftOutText(value: unknown): string {
  if (!isPlainObject(value)) return "";
  const { streams, unanswered, conflicting } = value;
  const named = Array.isArray(conflicting)
    ? conflicting.filter((name) => typeof name === "string")
    : [];
  return [
    typeof streams === "number" && streams > 0 && `${streams} stream calls`,
    typeof unanswered === "number" && unanswered > 0 && `${unanswered} calls with no answer`,
    named.length > 0 && `${named.join(", ")}, whose route another endpoint took`,
  ]
    .filter(Boolean)
    .join("; ");
}
