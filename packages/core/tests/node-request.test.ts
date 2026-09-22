/**
 * A body parser mounted across the whole application consumes the request
 * before the proxy route runs. The platform then says only that the body is
 * "disturbed or locked", which tells the developer nothing about the
 * middleware that did it — and the documented Express setup did exactly this.
 */
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";

import { describe, expect, it } from "vitest";

import { ConfigurationError } from "../src/errors/configuration-error";
import { toWebRequest } from "../src/node";

/** A Node request carrying a body, as a server hands it over. */
function incoming(method: string, body: string, consumed = false): IncomingMessage {
  const stream = Readable.from([Buffer.from(body)]) as unknown as IncomingMessage;
  stream.method = method;
  stream.url = "/api/request";
  stream.headers = { host: "app.test", "content-type": "application/json" };
  Object.defineProperty(stream, "socket", { value: {} });
  if (consumed) {
    /* What `express.json()` leaves behind. */
    Object.defineProperty(stream, "readableEnded", { value: true });
    Object.defineProperty(stream, "readableDidRead", { value: true });
  }
  return stream;
}

describe("a request whose body is still there", () => {
  it("becomes a Request", async () => {
    const request = toWebRequest(incoming("POST", '{"a":1}'));

    expect(request.method).toBe("POST");
    expect(await request.json()).toEqual({ a: 1 });
  });

  it("carries the headers across", () => {
    expect(toWebRequest(incoming("POST", "{}")).headers.get("content-type")).toBe(
      "application/json",
    );
  });

  it("needs no body for GET", () => {
    const request = toWebRequest(incoming("GET", ""));

    expect(request.method).toBe("GET");
    expect(request.body).toBeNull();
  });
});

describe("a request whose body something already read", () => {
  it("names the cause instead of failing inside the platform", () => {
    expect(() => toWebRequest(incoming("POST", "{}", true))).toThrow(ConfigurationError);
  });

  it("says what to do about it", () => {
    expect(() => toWebRequest(incoming("POST", "{}", true))).toThrow(/body parser/i);
  });

  it("carries a code a caller can branch on", () => {
    try {
      toWebRequest(incoming("POST", "{}", true));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ConfigurationError).code).toBe("REQUEST_BODY_ALREADY_READ");
    }
  });

  /** GET has no body to lose, so a consumed stream is irrelevant there. */
  it("does not complain about a GET", () => {
    expect(() => toWebRequest(incoming("GET", "", true))).not.toThrow();
  });
});
