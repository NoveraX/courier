import type { MockConditions, RecordedRequest, RequestQuery, StudioMock } from "./live-types";
import { isRecord } from "./studio-guards";
import { TOKEN_HEADER } from "./studio-token";

/* Studio answers on this machine at once; one that takes longer is not answering. */
const TIMEOUT_MS = 4_000;

/** Studio refused a change: why, in its own words. */
export class StudioRefusal extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "StudioRefusal";
    this.status = status;
  }
}

/**
 * Ask Studio for the requests it recorded, newest first. A Studio older
 * than the route answers 404, which reads as none.
 *
 * @param studio - Studio's address
 * @param wanted - The failed ones alone, one endpoint's, and how many
 * @returns The requests
 * @throws {Error} When Studio does not answer
 * @example
 * ```ts
 * await fetchRequests(studio, { failed: true, limit: 50 });
 * ```
 */
export async function fetchRequests(
  studio: string,
  wanted: RequestQuery = {},
): Promise<RecordedRequest[]> {
  const answer = await call(studio, "/api/editor/requests", wanted, undefined, [404]);
  const list = isRecord(answer) ? answer.requests : undefined;
  return Array.isArray(list) ? list.filter(isRequest) : [];
}

/**
 * Ask Studio for the mocks it runs, their scenarios and conditions. A
 * Studio older than the route answers 404, which reads as none.
 *
 * @param studio - Studio's address
 * @returns The mocks
 * @throws {Error} When Studio does not answer
 * @example
 * ```ts
 * await fetchMocks(studio);
 * ```
 */
export async function fetchMocks(studio: string): Promise<StudioMock[]> {
  const answer = await call(studio, "/api/editor/mocks", {}, undefined, [404]);
  const list = isRecord(answer) ? answer.mocks : undefined;
  return Array.isArray(list) ? list.filter(isMock) : [];
}

/**
 * Switch a mock to one of its scenarios, with the project's token.
 *
 * @param studio - Studio's address
 * @param token - The project's token
 * @param mock - The mock's id
 * @param scenario - The scenario's name
 * @throws {StudioRefusal} When Studio refuses: no token, no such mock, or the mock did not switch
 * @example
 * ```ts
 * await switchScenario(studio, token, "shop", "empty");
 * ```
 */
export async function switchScenario(
  studio: string,
  token: string | undefined,
  mock: string,
  scenario: string,
): Promise<void> {
  await call(studio, "/api/editor/mocks/scenario", { mock, scenario }, token);
}

/**
 * Set a mock's delay or faults by Studio's presets, or stop both, with the
 * project's token.
 *
 * @param studio - Studio's address
 * @param token - The project's token
 * @param mock - The mock's id
 * @param conditions - What to set
 * @throws {StudioRefusal} When Studio refuses
 * @example
 * ```ts
 * await setConditions(studio, token, "shop", { latency: "3g" });
 * ```
 */
export async function setConditions(
  studio: string,
  token: string | undefined,
  mock: string,
  conditions: MockConditions,
): Promise<void> {
  await call(studio, "/api/editor/mocks/conditions", { mock, ...conditions }, token);
}

async function call(
  studio: string,
  path: string,
  body: unknown,
  token: string | undefined,
  absent: readonly number[] = [],
): Promise<unknown> {
  const response = await fetch(new URL(path, studio), {
    method: "POST",
    headers: { "content-type": "application/json", ...(token && { [TOKEN_HEADER]: token }) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (absent.includes(response.status)) return {};
  const answer: unknown = await response.json().catch(() => ({}));
  if (response.ok) return answer;
  const said = isRecord(answer) && typeof answer.error === "string" ? answer.error : undefined;
  throw new StudioRefusal(response.status, said ?? `Courier Studio answered ${response.status}`);
}

function isRequest(value: unknown): value is RecordedRequest {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.source === "string" &&
    typeof value.endpoint === "string" &&
    typeof value.startedAt === "number" &&
    (value.state === "success" || value.state === "error" || value.state === "pending")
  );
}

function isMock(value: unknown): value is StudioMock {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.status === "string" &&
    Array.isArray(value.scenarios) &&
    value.scenarios.every((each) => isRecord(each) && typeof each.name === "string") &&
    (value.activeScenario === null || typeof value.activeScenario === "string") &&
    typeof value.latency === "string" &&
    typeof value.chaos === "string"
  );
}
