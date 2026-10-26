/**
 * @vitest-environment jsdom
 *
 * A request that got no answer shows why, as the system said it: its code
 * in the Error tab's badge — once, where it says what the kind does not —
 * its text under the message unless the message says it, and in the raw
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

function unanswered(code: string | undefined, said = "failed") {
  return requestEntry({
    status: "error",
    statusCode: undefined,
    error: {
      type: "network",
      message: "Network request failed",
      cause: code === undefined ? { message: said } : { code, message: said },
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

  it("shows its kind once when the system gave no code, or a code that says the same", () => {
    const uncoded = failureOf(
      requestEntry({
        status: "error",
        statusCode: undefined,
        error: { type: "network", message: "Network request failed" },
      }),
    );
    const timedOut = failureOf(
      requestEntry({
        status: "error",
        statusCode: undefined,
        error: {
          type: "timeout",
          message: "Request timed out after 5000 ms",
          cause: { code: "TIMEOUT", message: "The request timed out after 5000 ms" },
        },
      }),
    );

    expect([uncoded?.type, uncoded?.code]).toEqual(["NETWORK", undefined]);
    expect([timedOut?.type, timedOut?.code]).toEqual(["TIMEOUT", undefined]);
  });

  it("says a cause the message already says once", () => {
    const repeated = failureOf(unanswered(undefined, "Network request failed"));
    const different = failureOf(unanswered("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:1"));

    expect(repeated?.cause).toBeUndefined();
    expect(different?.cause).toBe("connect ECONNREFUSED 127.0.0.1:1");
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
      "ConnectionRefused",
      "ConnectionClosed",
      "FailedToOpenSocket",
    ]) {
      expect(failureHint(unanswered(code))).toMatch(/connection to it failed/);
      expect(failureHint(unanswered(code))).toMatch(/firewall, VPN or proxy/);
    }
    for (const code of [
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
      "UNABLE_TO_GET_ISSUER_CERT",
      "CERT_HAS_EXPIRED",
      "CERT_NOT_YET_VALID",
      "CERT_REVOKED",
      "HOSTNAME_MISMATCH",
      "ERR_TLS_CERT_ALTNAME_INVALID",
    ]) {
      expect(failureHint(unanswered(code))).toMatch(/certificate was not trusted/);
      expect(failureHint(unanswered(code))).toMatch(
        /NODE_EXTRA_CA_CERTS — or, when this machine already trusts it, through NODE_USE_SYSTEM_CA=1, which Node\.js reads from 22\.19 and 24\.6 on;/,
      );
    }
  });

  it("tells an answer that broke as it came, an API that sent no headers in time, and redirects with no end apart", () => {
    for (const code of [
      "Z_DATA_ERROR",
      "Z_BUF_ERROR",
      "UND_ERR_RES_CONTENT_LENGTH_MISMATCH",
      "ERR_STREAM_PREMATURE_CLOSE",
      "UND_ERR_BODY_TIMEOUT",
    ]) {
      const hint = failureHint(unanswered(code));
      expect(hint).toMatch(/began to come back, but it broke/);
      expect(hint).not.toMatch(/could not reach the API/);
    }
    expect(failureHint(unanswered("UND_ERR_HEADERS_TIMEOUT"))).toMatch(/sent no headers in time/);
    expect(failureHint(unanswered(undefined, "redirect count exceeded"))).toMatch(
      /redirects that never reached/,
    );
    expect(failureHint(unanswered(undefined, "The response redirected too many times"))).toMatch(
      /redirects that never reached/,
    );
    expect(failureHint(unanswered("TooManyRedirects", "fetch() failed"))).toMatch(
      /redirects that never reached/,
    );
  });

  describe("for a request the app's own code made on the way", () => {
    const OWN =
      "A request the app's own code made on the way, in a middleware or in pathOptions, got no answer.";
    const own = (code: string) =>
      failureHint(
        requestEntry({
          status: "error",
          statusCode: undefined,
          error: { type: "unknown", message: "fetch failed", cause: { code, message: "failed" } },
        }),
      );

    it("is about the host that code called, by the system's code", () => {
      expect(own("ENOTFOUND")).toBe(
        `${OWN} The host name it called did not resolve (ENOTFOUND). Check the address your code calls for a typo, and that this machine's network can resolve it: a host only a VPN or an internal DNS knows needs that network.`,
      );
      expect(own("UND_ERR_CONNECT_TIMEOUT")).toBe(
        `${OWN} The host your code called was found, but the connection to it failed (UND_ERR_CONNECT_TIMEOUT). Check that it runs and listens on the port your code calls, and that no firewall, VPN or proxy in between drops the connection.`,
      );
      expect(own("UND_ERR_HEADERS_TIMEOUT")).toBe(
        `${OWN} The host your code called took the connection but sent no headers in time (UND_ERR_HEADERS_TIMEOUT): it is slow to answer, or hangs. Look at what it does for that request, or give the request your code makes a longer timeout.`,
      );
      expect(own("UND_ERR_BODY_TIMEOUT")).toBe(
        `${OWN} An answer began to come back to it, but it broke before it was whole (UND_ERR_BODY_TIMEOUT): it was cut off, or its compression did not read. Check the server your code called, and any proxy in between that rewrites or compresses its answers.`,
      );
      expect(own("CERT_HAS_EXPIRED")).toBe(
        `${OWN} The TLS certificate of the host your code called was not trusted (CERT_HAS_EXPIRED). A self-signed certificate, or one from a private authority — a company's, or that of a VPN or a proxy that inspects traffic — needs that authority given to Node.js through NODE_EXTRA_CA_CERTS — or, when this machine already trusts it, through NODE_USE_SYSTEM_CA=1, which Node.js reads from 22.19 and 24.6 on; an expired, revoked or not yet valid certificate, or one issued for another host name, needs fixing on that server.`,
      );
      expect(own("TooManyRedirects")).toBe(
        `${OWN} The host your code called answered with redirects that never reached an answer: one points back to another, or each to the next. Check where its Location headers point, and the address your code calls.`,
      );
      expect(own("ERR_SSL_WRONG_VERSION_NUMBER")).toBe(
        `${OWN} Check that the host your code called runs and that this machine can reach it. The system reported ERR_SSL_WRONG_VERSION_NUMBER.`,
      );
    });

    it("never sends the user to the source's baseURL or the endpoint's timeout", () => {
      for (const code of [
        "ENOTFOUND",
        "ECONNREFUSED",
        "UND_ERR_HEADERS_TIMEOUT",
        "UND_ERR_RES_CONTENT_LENGTH_MISMATCH",
        "DEPTH_ZERO_SELF_SIGNED_CERT",
        "TooManyRedirects",
        "UND_ERR_SOCKET",
      ]) {
        expect(own(code)).not.toMatch(/baseURL|the endpoint|Courier could not reach/);
      }
    });

    it("is none for a failure no request caused: a file, the app's own decompression or stream", () => {
      for (const code of ["ENOENT", "Z_DATA_ERROR", "Z_BUF_ERROR", "ERR_STREAM_PREMATURE_CLOSE"]) {
        expect(own(code)).toBeUndefined();
      }
    });
  });

  it("names a code it has no advice of its own for", () => {
    const hint = failureHint(unanswered("EPROTO"));

    expect(hint).toMatch(/could not reach the API/);
    expect(hint).toMatch(/reported EPROTO/);
  });

  it("is the general advice, and what a browser hides, for a browser's fetch", () => {
    for (const said of [
      "Failed to fetch",
      "Load failed",
      "NetworkError when attempting to fetch resource.",
    ]) {
      expect(failureHint(unanswered(undefined, said))).toMatch(/could not reach the API.*CORS/);
    }
  });

  it("names no CORS for a server's fetch that gave no code", () => {
    for (const said of [
      "Request cannot be constructed from a URL that includes credentials: http://127.0.0.1:1/x",
      "Request was cancelled.",
      "fetch failed",
    ]) {
      const hint = failureHint(unanswered(undefined, said));
      expect(hint).toMatch(/gave no error code/);
      expect(hint).not.toMatch(/CORS/);
    }
  });

  it("is the general advice when the runtime told no cause", () => {
    const hint = failureHint(
      requestEntry({
        status: "error",
        statusCode: undefined,
        error: { type: "network", message: "Network request failed" },
      }),
    );

    expect(hint).toMatch(/could not reach the API/);
    expect(hint).not.toMatch(/CORS/);
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
