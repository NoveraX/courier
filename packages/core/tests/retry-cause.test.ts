/**
 * Why a stream's last connection ended, as Studio shows it beside the
 * reconnect — told from what the client saw: the error the connection
 * failed with, a refusal it retries, a socket's error event and close, or a
 * server that fell silent.
 */
import { describe, expect, it } from "vitest";

import { SSEResponseError } from "../src/realtime/sse/sse-response";
import { retryCause } from "../src/transport/instrument/retry-cause";

const RETRY = { failures: 1, retryIn: 1000 };

function refused(code: string, message: string): TypeError {
  return new TypeError("fetch failed", { cause: Object.assign(new Error(message), { code }) });
}

describe("why a stream's connection ended", () => {
  it("is the system's code and text, for a connection fetch could not make", () => {
    const error = refused("ENOTFOUND", "getaddrinfo ENOTFOUND feed.example.invalid");

    expect(retryCause({ ...RETRY, error })).toEqual({
      code: "ENOTFOUND",
      message: "getaddrinfo ENOTFOUND feed.example.invalid",
    });
  });

  it("is a browser's text, which has no code", () => {
    expect(retryCause({ ...RETRY, error: new TypeError("Failed to fetch") })).toEqual({
      message: "Failed to fetch",
    });
  });

  it("is the status and its reason, for a refusal the client retries", () => {
    const busy = new SSEResponseError(429, "Too Many Requests", 2000);
    const bare = new SSEResponseError(502, "", undefined);

    expect(retryCause({ ...RETRY, error: busy })).toEqual({ message: "429 Too Many Requests" });
    expect(retryCause({ ...RETRY, error: bare })).toEqual({ message: "502" });
  });

  it("is what the app's session gave, when the connection's headers could not be had", () => {
    expect(retryCause({ ...RETRY, error: new Error("The session has expired") })).toEqual({
      message: "The session has expired",
    });
  });

  it("is a silent server, before anything the abort said", () => {
    const aborted = new DOMException("This operation was aborted", "AbortError");

    expect(retryCause({ ...RETRY, error: aborted, silentFor: 45_000 })).toEqual({
      message: "No event or heartbeat came for 45000 ms",
    });
  });

  it("is the platform's error a socket's error event carries, as the ws package's does", () => {
    const event = {
      type: "error",
      error: refused("ECONNREFUSED", "connect ECONNREFUSED ::1:4010"),
    };

    expect(retryCause({ ...RETRY, error: event, closed: { code: 1006, reason: "" } })).toEqual({
      code: "ECONNREFUSED",
      message: "connect ECONNREFUSED ::1:4010",
    });
  });

  it("is the text a socket's error event carries, where it carries no error", () => {
    const event = { type: "error", message: "Unexpected server response: 502" };

    expect(retryCause({ ...RETRY, error: event, closed: { code: 1006, reason: "" } })).toEqual({
      message: "Unexpected server response: 502",
    });
  });

  it("is the socket's close, where its error event says nothing, as Node's and a browser's do", () => {
    const silentEvent = { type: "error", message: "", error: new TypeError("") };

    expect(
      retryCause({
        ...RETRY,
        error: silentEvent,
        closed: { code: 1006, reason: "" },
        opened: false,
      }),
    ).toEqual({ message: "The socket closed with code 1006 before it opened" });
    expect(
      retryCause({ ...RETRY, closed: { code: 1001, reason: "Server restarting" }, opened: true }),
    ).toEqual({ message: "The socket closed with code 1001: Server restarting" });
  });

  it("is the socket's close, where the error it failed with says nothing", () => {
    expect(
      retryCause({
        ...RETRY,
        error: new TypeError(""),
        closed: { code: 1006, reason: "" },
        opened: false,
      }),
    ).toEqual({ message: "The socket closed with code 1006 before it opened" });
  });

  it("is a connection that closed before the stream ended, where nothing failed", () => {
    expect(retryCause({ failures: 0, retryIn: 0, opened: true })).toEqual({
      message: "The connection closed before the stream ended",
    });
  });
});
