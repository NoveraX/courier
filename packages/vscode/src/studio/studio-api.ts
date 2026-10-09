/** How an endpoint's calls went, as Studio tells an editor. */
export interface EndpointStats {
  readonly source: string;
  readonly endpoint: string;
  /** What it does — a stream's or a channel's calls are its connections; an older Studio leaves it out */
  readonly kind?: "query" | "mutation" | "stream" | "channel" | undefined;
  readonly calls: number;
  readonly failed: number;
  readonly pending: number;
  readonly statuses: Readonly<Record<string, number>>;
  readonly p50?: number | undefined;
  readonly p95?: number | undefined;
  readonly lastAt?: number | undefined;
  readonly lastFailure?:
    | { readonly at: number; readonly status?: number; readonly message: string }
    | undefined;
}

/** A call to an endpoint in a file, as Studio placed it: lines and columns from 1. */
export interface EndpointCall {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly endpoints: readonly { readonly source: string; readonly endpoint: string }[];
}

/* Studio answers on this machine at once; one that takes longer is not answering. */
const TIMEOUT_MS = 4_000;

/**
 * Ask Studio how each endpoint's calls went.
 *
 * @param studio - Studio's address: `http://localhost:6280`
 * @returns The endpoints' stats
 * @throws {Error} When Studio does not answer, or answers with a failure
 * @example
 * ```ts
 * const stats = await fetchEndpointStats("http://localhost:6280");
 * ```
 */
export async function fetchEndpointStats(studio: string): Promise<EndpointStats[]> {
  const answer = await postTo(studio, "/api/editor/endpoints", {});
  return isRecord(answer) && Array.isArray(answer.endpoints)
    ? answer.endpoints.filter(isStats)
    : [];
}

/**
 * Ask Studio where a file calls the project's endpoints — the text as it
 * stands in the editor, saved or not.
 *
 * @param studio - Studio's address
 * @param file - The file's path
 * @param text - Its text
 * @returns The calls, placed
 * @throws {Error} When Studio does not answer, or answers with a failure
 * @example
 * ```ts
 * const calls = await fetchCalls(studio, document.fileName, document.getText());
 * ```
 */
export async function fetchCalls(
  studio: string,
  file: string,
  text: string,
): Promise<EndpointCall[]> {
  const answer = await postTo(studio, "/api/editor/calls", { file, text });
  return isRecord(answer) && Array.isArray(answer.calls) ? answer.calls.filter(isCall) : [];
}

async function postTo(studio: string, path: string, body: unknown): Promise<unknown> {
  const response = await fetch(new URL(path, studio), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Courier Studio answered ${response.status} to ${path}`);
  return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStats(value: unknown): value is EndpointStats {
  return (
    isRecord(value) &&
    typeof value.source === "string" &&
    typeof value.endpoint === "string" &&
    typeof value.calls === "number" &&
    typeof value.failed === "number"
  );
}

function isCall(value: unknown): value is EndpointCall {
  return (
    isRecord(value) &&
    typeof value.line === "number" &&
    typeof value.column === "number" &&
    typeof value.endLine === "number" &&
    typeof value.endColumn === "number" &&
    Array.isArray(value.endpoints)
  );
}
