import {
  isCall,
  isDefinition,
  isFinding,
  isGroupPlace,
  isRecord,
  isSite,
  isStats,
} from "./studio-guards";
import { TOKEN_HEADER } from "./studio-token";
import { StudioTokenRefusal } from "./studio-token-refusal";
import type {
  CallSite,
  EndpointCall,
  EndpointDefinition,
  EndpointStats,
  Finding,
  GroupPlace,
} from "./studio-types";

/* Studio answers on this machine at once; one that takes longer is not answering. */
const TIMEOUT_MS = 4_000;

/** How a request goes: the statuses an older Studio without its route answers, and the token. */
interface Asking {
  readonly absent?: readonly number[];
  readonly token?: string | undefined;
}

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
 * Ask Studio where the project's code calls an endpoint, with the
 * project's token: Studio shows the lines of the code only to a caller
 * that presents it.
 *
 * @param studio - Studio's address
 * @param source - The endpoint's source
 * @param endpoint - Its call in the client: `orders.place`
 * @param token - The project's token, when the extension has it
 * @returns The call sites, file by file
 * @throws {StudioTokenRefusal} When Studio refuses for want of the token
 * @throws {Error} When Studio does not answer, or answers with a failure
 * @example
 * ```ts
 * const sites = await fetchSites(studio, "shop", "orders.place", token);
 * ```
 */
export async function fetchSites(
  studio: string,
  source: string,
  endpoint: string,
  token?: string,
): Promise<CallSite[]> {
  const answer = await postTo(studio, "/api/editor/sites", { source, endpoint }, { token });
  return listOf(answer, "sites", isSite);
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
  const answer = await postTo(studio, "/api/editor/findings", {}, { absent: [404] });
  return listOf(answer, "findings", isFinding);
}

/**
 * Ask Studio where the project's files declare each endpoint, with the
 * project's token, which Studio asks for. A Studio older than the route
 * answers 404, which reads as none found.
 *
 * @param studio - Studio's address
 * @param token - The project's token, when the extension has it
 * @returns The declarations
 * @throws {StudioTokenRefusal} When Studio refuses for want of the token
 * @throws {Error} When Studio does not answer
 * @example
 * ```ts
 * const definitions = await fetchDefinitions(studio, token);
 * ```
 */
export async function fetchDefinitions(
  studio: string,
  token?: string,
): Promise<EndpointDefinition[]> {
  const answer = await postTo(studio, "/api/editor/definitions", {}, { absent: [404], token });
  return listOf(answer, "definitions", isDefinition);
}

/**
 * Ask Studio where each group writes its endpoints, as an editor adds one,
 * with the project's token, which Studio asks for. A Studio older than the
 * route answers 404, which reads as none found.
 *
 * @param studio - Studio's address
 * @param token - The project's token, when the extension has it
 * @returns The places
 * @throws {StudioTokenRefusal} When Studio refuses for want of the token
 * @throws {Error} When Studio does not answer
 * @example
 * ```ts
 * const groups = await fetchGroups(studio, token);
 * ```
 */
export async function fetchGroups(studio: string, token?: string): Promise<GroupPlace[]> {
  const answer = await postTo(studio, "/api/editor/groups", {}, { absent: [404], token });
  return listOf(answer, "groups", isGroupPlace);
}

/** A source as an OpenAPI document, as Studio writes it. */
export interface OpenApiDocument {
  readonly text: string;
  readonly fileName: string;
  readonly version: string;
  /** The endpoints it leaves out — a channel has no OpenAPI form — and why */
  readonly leftOut: readonly unknown[];
}

/**
 * Ask Studio to write a source as an OpenAPI document.
 *
 * @param studio - Studio's address
 * @param source - The source's name
 * @returns The document
 * @throws {Error} When Studio does not answer, or has no such source
 * @example
 * ```ts
 * (await fetchOpenApi(studio, "shop")).fileName; // "shop.openapi.json"
 * ```
 */
export async function fetchOpenApi(studio: string, source: string): Promise<OpenApiDocument> {
  const answer = await postTo(studio, "/api/openapi/document", { source });
  const text = isRecord(answer) && typeof answer.text === "string" ? answer.text : "{}\n";
  const fileName =
    isRecord(answer) && typeof answer.fileName === "string"
      ? answer.fileName
      : `${source}.openapi.json`;
  const leftOut = isRecord(answer) && Array.isArray(answer.leftOut) ? answer.leftOut : [];
  const version = /"openapi":\s*"([^"]+)"/.exec(text)?.[1] ?? "3.1.0";
  return { text, fileName, version, leftOut };
}

async function postTo(
  studio: string,
  path: string,
  body: unknown,
  { absent = [], token }: Asking = {},
): Promise<unknown> {
  const response = await fetch(new URL(path, studio), {
    method: "POST",
    headers: { "content-type": "application/json", ...(token && { [TOKEN_HEADER]: token }) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (absent.includes(response.status)) return {};
  if (response.status === 401) throw new StudioTokenRefusal();
  if (!response.ok) throw new Error(`Courier Studio answered ${response.status} to ${path}`);
  return response.json();
}

function listOf<TItem>(answer: unknown, key: string, isItem: (value: unknown) => value is TItem) {
  const list = isRecord(answer) ? answer[key] : undefined;
  return Array.isArray(list) ? list.filter(isItem) : [];
}
