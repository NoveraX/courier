/**
 * What a failed request tells the browser about the server's own side.
 *
 * A transport-level failure carries the operating system's words, and those
 * name the host the server was dialling. Sending them to a browser discloses
 * the upstream the proxy exists to keep behind it — and does so on the first
 * DNS hiccup, which is why no test of upstream *status codes* ever saw it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { courier, defineApi } from "../src/define/index";
import { HTTPError } from "../src/errors";
import type { Context } from "../src/http-client/types";
import { executeRequest } from "../src/utils/execute";

const { endpoint } = courier();

const UPSTREAM_HOST = "internal-api.corp.example";

const api = defineApi({
  baseURL: `https://${UPSTREAM_HOST}`,
  endpoints: { items: endpoint.get("items").response<unknown>() },
});

const sources = { api };
const fetchSpy = vi.fn();

/** A failure as undici reports it: the reason travels in `cause`. */
function transportFailure(message: string, code?: string): Error {
  const cause = Object.assign(new Error(message), code ? { code } : {});
  return Object.assign(new TypeError("fetch failed"), { cause });
}

/** Drive the proxy path and return what the browser would receive. */
async function throughProxy(): Promise<{ status: number; body: string }> {
  const response = (await executeRequest(sources, { source: "api", method: "items" } as never, {
    res: new Response(),
    proxyMethod: "GET",
    req: new Request("https://app.example.com/api/request"),
  } as Context & { res: Response })) as Response;

  return { status: response.status, body: await response.text() };
}

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a transport failure does not name the upstream", () => {
  const failures: ReadonlyArray<readonly [string, Error]> = [
    ["DNS", transportFailure(`getaddrinfo ENOTFOUND ${UPSTREAM_HOST}`, "ENOTFOUND")],
    ["connection refused", transportFailure(`connect ECONNREFUSED ${UPSTREAM_HOST}:443`, "ECONNREFUSED")],
    ["TLS", transportFailure(`unable to verify the first certificate for ${UPSTREAM_HOST}`)],
    ["timeout", transportFailure(`Connect Timeout Error (${UPSTREAM_HOST})`, "UND_ERR_CONNECT_TIMEOUT")],
  ];

  for (const [label, failure] of failures) {
    it(`keeps the host out of the answer when ${label} fails`, async () => {
      fetchSpy.mockRejectedValue(failure);

      const { status, body } = await throughProxy();

      expect(body).not.toContain(UPSTREAM_HOST);
      expect(status).toBe(502);
    });
  }

  it("still tells the caller the request failed, and how to recognise it", async () => {
    fetchSpy.mockRejectedValue(transportFailure(`getaddrinfo ENOTFOUND ${UPSTREAM_HOST}`, "ENOTFOUND"));

    const { body } = await throughProxy();

    expect(JSON.parse(body)).toEqual({
      success: false,
      message: "Upstream request failed",
      code: "UPSTREAM_UNREACHABLE",
    });
  });

  it("does not disclose the operating system's error code either", async () => {
    fetchSpy.mockRejectedValue(transportFailure("socket hang up", "ECONNRESET"));

    const { body } = await throughProxy();

    expect(body).not.toContain("ECONNRESET");
  });
});

describe("what the proxy still forwards", () => {
  it("passes an upstream's own error through, since that is its answer to the client", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: "quota exceeded", retryIn: 60 }), { status: 429 }),
    );

    const { status, body } = await throughProxy();

    expect(status).toBe(429);
    expect(body).toContain("quota exceeded");
  });

  it("does not hand a browser the text of a failure inside the server", async () => {
    fetchSpy.mockImplementation(() => {
      throw new RangeError(`middleware read /etc/secrets/${UPSTREAM_HOST}.pem`);
    });

    const { body } = await throughProxy();

    expect(body).not.toContain(UPSTREAM_HOST);
    expect(body).not.toContain("/etc/secrets");
  });
});

/**
 * A server-side caller is the operator. Hiding the reason from it would only
 * make the failure harder to diagnose, and nothing crossed a trust boundary.
 */
describe("a direct caller still gets the reason", () => {
  it("keeps the transport failure intact for an in-process call", async () => {
    fetchSpy.mockRejectedValue(transportFailure(`getaddrinfo ENOTFOUND ${UPSTREAM_HOST}`, "ENOTFOUND"));

    await executeRequest(sources, { source: "api", method: "items" } as never).then(
      () => expect.fail("the call should have failed"),
      (error: unknown) => {
        expect(error).toBeInstanceOf(HTTPError);
        const payload = (error as HTTPError).data as { message?: string };
        expect(payload.message).toContain(UPSTREAM_HOST);
      },
    );
  });
});

/**
 * The reason a browser is not told goes to the server's log, whole: a host
 * that resolves to several addresses fails with an AggregateError whose own
 * message is empty, so text alone would say nothing.
 */
describe("what the server's log keeps", () => {
  it("logs the upstream failure with the error itself, the addresses tried included", async () => {
    const systemError = (address: string) =>
      Object.assign(new Error(`connect ECONNREFUSED ${address}:4000`), { code: "ECONNREFUSED", address, port: 4000 });
    const refused = new AggregateError([systemError("::1"), systemError("127.0.0.1")], "");
    const failure = Object.assign(new TypeError("fetch failed"), { cause: refused });
    fetchSpy.mockRejectedValue(failure);

    await throughProxy();

    const warn = vi.mocked(console.warn).mock.calls.find((call) => String(call[1]).includes("Upstream request failed"));
    expect(warn?.[2]).toBe(failure);
    expect(String(warn?.[1])).toContain("connect ECONNREFUSED ::1:4000; connect ECONNREFUSED 127.0.0.1:4000");
  });

  it("gives a direct caller the addresses that refused, not an empty message", async () => {
    const refused = new AggregateError([new Error("connect ECONNREFUSED ::1:4000")], "");
    fetchSpy.mockRejectedValue(Object.assign(new TypeError("fetch failed"), { cause: refused }));

    await executeRequest(sources, { source: "api", method: "items" } as never).then(
      () => expect.fail("the call should have failed"),
      (error: unknown) => {
        expect(((error as HTTPError).data as { message?: string }).message).toBe(
          "connect ECONNREFUSED ::1:4000",
        );
      },
    );
  });
});
