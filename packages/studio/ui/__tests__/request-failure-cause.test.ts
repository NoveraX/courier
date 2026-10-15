/**
 * @vitest-environment jsdom
 *
 * A request that got no answer shows why, as the system said it: its code
 * in the Error tab's badge, its text under the message and in the raw
 * error, a fix chosen by the code, and both in the Overview — read back
 * the same from a saved session.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { failureHint } from "@/features/requests/failure-hints";
import { failureOf } from "@/features/requests/request-failure";
import { requestProperties } from "@/features/requests/request-properties";
import { requestFromSaved, savedRequestOf } from "@/features/sessions/saved-request";
import { useStudioStore } from "@/store";
import type { EventType, StudioEvent } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";

type Event = StudioEvent & Record<string, unknown>;

function event(type: EventType, fields: Record<string, unknown> = {}): Event {
  return { id: "r1", type, timestamp: 1, sessionId: "app", requestId: "r1", ...fields };
}

function failedWith(cause: unknown) {
  useStudioStore.getState().handleEvents([
    event("request:start", { source: "api", method: "ping", mode: "direct" }),
    event("request:error", {
      error: { type: "network", message: "Network request failed", cause },
    }),
  ]);
  return useStudioStore.getState().requests[0];
}

function unanswered(code: string | undefined) {
  return requestEntry({
    status: "error",
    statusCode: undefined,
    error: {
      type: "network",
      message: "Network request failed",
      cause: { code, message: "failed" },
    },
  });
}

beforeEach(() => {
  useStudioStore.setState({ requests: [] });
});

describe("why a request got no answer, as the store keeps it", () => {
  it("keeps the system's code and text", () => {
    const request = failedWith({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" });

    expect(request?.error?.cause).toEqual({
      code: "ENOTFOUND",
      message: "getaddrinfo ENOTFOUND api.test",
    });
  });

  it("keeps a browser's text, which has no code", () => {
    expect(failedWith({ message: "Failed to fetch" })?.error?.cause).toEqual({
      message: "Failed to fetch",
    });
  });

  it("drops a code in another shape, and cuts a text longer than the runtime sends", () => {
    const request = failedWith({ code: "<b>x</b>", message: "y".repeat(500) });

    expect(request?.error?.cause).toEqual({ message: "y".repeat(300) });
  });

  it("keeps none for a cause in another shape", () => {
    expect(failedWith("ENOTFOUND")?.error?.cause).toBeUndefined();
    expect(failedWith({ code: "ENOTFOUND" })?.error?.cause).toBeUndefined();
  });
});

describe("the Error tab of a request that got no answer", () => {
  it("shows the code in its badge, the text under the message, and both in the raw error", () => {
    const failure = failureOf(
      requestEntry({
        status: "error",
        statusCode: undefined,
        error: {
          type: "network",
          message: "Network request failed",
          cause: { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:4100" },
        },
      }),
    );

    expect(failure?.code).toBe("ECONNREFUSED");
    expect(failure?.message).toBe("Network request failed");
    expect(failure?.cause).toBe("connect ECONNREFUSED 127.0.0.1:4100");
    expect(JSON.parse(failure?.raw ?? "{}")).toMatchObject({
      type: "network",
      message: "Network request failed",
      cause: { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:4100" },
      requestId: "r1",
    });
  });

  it("shows the code, and a fetch that got no answer, when the proxy answered its caller 502", () => {
    const failure = failureOf(
      requestEntry({
        mode: "proxy",
        status: "error",
        statusCode: 502,
        error: {
          type: "network",
          message: "Network request failed",
          cause: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" },
        },
      }),
    );

    expect(failure?.code).toBe("ENOTFOUND");
    expect(failure?.stages[1]).toEqual({ label: "Fetch", state: "err", meta: "no answer" });
    expect(JSON.parse(failure?.raw ?? "{}")).toMatchObject({ status: 502 });
  });

  it("shows its kind in the badge when the system gave no code", () => {
    const failure = failureOf(
      requestEntry({
        status: "error",
        statusCode: undefined,
        error: { type: "network", message: "Network request failed" },
      }),
    );

    expect(failure?.code).toBe("network");
    expect(failure?.cause).toBeUndefined();
  });
});

describe("the fix suggested for a request that got no answer", () => {
  it("is chosen by the code", () => {
    for (const code of ["ENOTFOUND", "EAI_AGAIN"]) {
      expect(failureHint(unanswered(code))).toMatch(/host name did not resolve/);
    }
    for (const code of [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
    ]) {
      expect(failureHint(unanswered(code))).toMatch(/connection to it failed/);
    }
    for (const code of [
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
      "CERT_HAS_EXPIRED",
      "ERR_TLS_CERT_ALTNAME_INVALID",
    ]) {
      expect(failureHint(unanswered(code))).toMatch(/certificate was not trusted/);
    }
  });

  it("names a code it has no advice of its own for", () => {
    const hint = failureHint(unanswered("EPROTO"));

    expect(hint).toMatch(/could not reach the API/);
    expect(hint).toMatch(/reported EPROTO/);
  });

  it("is the general advice, and what a browser hides, with no code", () => {
    expect(failureHint(unanswered(undefined))).toMatch(/could not reach the API.*CORS/);
  });
});

describe("the Overview of a request that got no answer", () => {
  it("lists why, with its code", () => {
    const properties = requestProperties(unanswered("ENOTFOUND"), {});

    expect(properties).toContainEqual({ label: "Cause", value: "ENOTFOUND · failed", mono: true });
  });

  it("lists no cause for a request that has none", () => {
    const labels = requestProperties(requestEntry(), {}).map((property) => property.label);

    expect(labels).not.toContain("Cause");
  });
});

describe("a saved session", () => {
  it("reads back why a request got no answer", () => {
    const saved = savedRequestOf(unanswered("CERT_HAS_EXPIRED"));
    const read = requestFromSaved({ ...saved, responseHeaders: saved.headers });

    expect(read?.error?.cause).toEqual({ code: "CERT_HAS_EXPIRED", message: "failed" });
  });
});
