/**
 * The proxy boundary, end to end: a request that arrived over the wire may not
 * decide where the server's own fetch goes, what it carries, or what it says.
 *
 * Each case here reproduces something that worked before the boundary existed.
 * A server-side caller is checked too, because the fix must narrow only the
 * untrusted path — narrowing both would be a different bug.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { courier, defineApi } from "../src/define/index";
import { HTTPError } from "../src/errors";
import type { Context } from "../src/http-client/types";
import { executeRequest } from "../src/utils/execute";

const { endpoint } = courier();

const UPSTREAM = "https://legit.example";
const ATTACKER = "https://attacker.example";

const fetchSpy = vi.fn();

const api = defineApi({
  baseURL: UPSTREAM,
  endpoints: {
    getById: endpoint.get("users/:id").variables<{ id: string }>().response<unknown>(),
  },
});

const sources = { api };

/** A request as the proxy hands it over: the wire options travel in `options`. */
function wireCall(options: unknown) {
  return executeRequest(
    sources,
    { source: "api", method: "getById", variables: { id: "7" }, options } as never,
    { proxyMethod: "GET" } as Context,
  );
}

/** Every URL the client was asked to fetch during the test. */
function requestedUrls(): string[] {
  return fetchSpy.mock.calls.map(([input]) =>
    typeof input === "string" ? input : ((input as Request).url ?? String(input)),
  );
}

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("proxy boundary — a wire request cannot redirect the server", () => {
  it("refuses prefixUrl and never reaches the host it named", async () => {
    await expect(wireCall({ prefixUrl: ATTACKER })).rejects.toBeInstanceOf(HTTPError);

    expect(requestedUrls().join(" ")).not.toContain("attacker");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses headers, which carried an injected credential upstream", async () => {
    await expect(
      wireCall({ headers: { authorization: "Bearer attacker" } }),
    ).rejects.toBeInstanceOf(HTTPError);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses variables, which replaced the ones the schema had validated", async () => {
    await expect(wireCall({ variables: { id: "../../../admin" } })).rejects.toBeInstanceOf(
      HTTPError,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses searchParams, body and json", async () => {
    for (const field of ["searchParams", "body", "json"]) {
      fetchSpy.mockClear();

      await expect(wireCall({ [field]: { role: "admin" } })).rejects.toBeInstanceOf(HTTPError);
      expect(fetchSpy, field).not.toHaveBeenCalled();
    }
  });

  it("answers a refused envelope with 400, not with a request that half worked", async () => {
    await wireCall({ prefixUrl: ATTACKER }).then(
      () => expect.fail("the envelope should have been refused"),
      (error: unknown) => {
        expect(error).toBeInstanceOf(HTTPError);
        expect((error as HTTPError).status).toBe(400);
      },
    );
  });

  it("still serves a request whose envelope only asks for what it may", async () => {
    await wireCall({ rawData: true });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(requestedUrls()[0]).toContain(UPSTREAM);
    expect(requestedUrls()[0]).toContain("users/7");
  });

  it("still serves a request that carries no envelope at all", async () => {
    await wireCall(undefined);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(requestedUrls()[0]).toContain(UPSTREAM);
  });
});

/**
 * A server-side caller already chose the destination — it runs in this
 * process and nothing it passes crossed a trust boundary.
 */
describe("proxy boundary — a server-side caller keeps the full option set", () => {
  it("honours prefixUrl when the call did not come over the wire", async () => {
    await executeRequest(sources, {
      source: "api",
      method: "getById",
      variables: { id: "7" },
      options: { prefixUrl: ATTACKER },
    } as never);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(requestedUrls()[0]).toContain("attacker.example");
  });
});
