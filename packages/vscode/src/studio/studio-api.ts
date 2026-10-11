import { isCall, isFinding, isRecord, isSite, isStats } from "./studio-guards";
import type { CallSite, EndpointCall, EndpointStats, Finding } from "./studio-types";

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
  return listOf(await postTo(studio, "/api/editor/endpoints", {}), "endpoints", isStats);
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
  return listOf(await postTo(studio, "/api/editor/calls", { file, text }), "calls", isCall);
}

/**
 * Ask Studio where the project's code calls an endpoint.
 *
 * @param studio - Studio's address
 * @param source - The endpoint's source
 * @param endpoint - Its call in the client: `orders.place`
 * @returns The call sites, file by file
 * @throws {Error} When Studio does not answer, or answers with a failure
 * @example
 * ```ts
 * const sites = await fetchSites(studio, "shop", "orders.place");
 * ```
 */
export async function fetchSites(
  studio: string,
  source: string,
  endpoint: string,
): Promise<CallSite[]> {
  return listOf(await postTo(studio, "/api/editor/sites", { source, endpoint }), "sites", isSite);
}

/**
 * Ask Studio for its audit's findings that concern endpoints. A Studio
 * older than the route answers 404, which reads as no finding.
 *
 * @param studio - Studio's address
 * @returns The findings, errors first
 * @throws {Error} When Studio does not answer
 * @example
 * ```ts
 * const findings = await fetchFindings(studio);
 * ```
 */
export async function fetchFindings(studio: string): Promise<Finding[]> {
  const answer = await postTo(studio, "/api/editor/findings", {}, [404]);
  return listOf(answer, "findings", isFinding);
}

async function postTo(
  studio: string,
  path: string,
  body: unknown,
  absent: readonly number[] = [],
): Promise<unknown> {
  const response = await fetch(new URL(path, studio), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (absent.includes(response.status)) return {};
  if (!response.ok) throw new Error(`Courier Studio answered ${response.status} to ${path}`);
  return response.json();
}

function listOf<TItem>(answer: unknown, key: string, isItem: (value: unknown) => value is TItem) {
  const list = isRecord(answer) ? answer[key] : undefined;
  return Array.isArray(list) ? list.filter(isItem) : [];
}
