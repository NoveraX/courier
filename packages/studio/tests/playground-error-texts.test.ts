/**
 * What Studio passes on of a runtime's answer to a Playground call — to
 * the page that asked and to an agent's replay — holds no credential an
 * error's text quoted, whichever runtime sent it: a header value read
 * with its line break, a token the app's own fetch put in its message.
 */
import { UNSHOWN_CAUSE } from "@noverax/courier/internal";
import { describe, expect, it } from "vitest";
import { replayedOutcome } from "../src/server/mcp/replay-outcome";
import type { PlannedReplay } from "../src/server/mcp/replay-plan";
import { sanitizeChunk, sanitizeError } from "../src/server/runtime-playground-chunk-sanitize";
import { withShownErrorTexts } from "../src/server/shown-error-texts";

const REFUSED = 'Headers.append: "Bearer B34rer\nx" is an invalid header value.';
const SHOWN = 'Headers.append: "[redacted]" is an invalid header value.';

const plan = {
  request: { id: "r1" },
  kind: "read",
  call: "GET api.me",
} as unknown as PlannedReplay;

function chunkOf(chunk: Record<string, unknown>) {
  const sanitized = sanitizeChunk({ rid: "r1", chunk });
  if (!sanitized) throw new Error("the chunk was refused");
  return sanitized.chunk;
}

describe("a Playground call's result", () => {
  it("has the token a refused header value carried cut from its error", () => {
    expect(chunkOf({ kind: "http-result", status: 500, error: REFUSED })).toEqual({
      kind: "http-result",
      status: 500,
      error: SHOWN,
    });
  });

  it("passes on none of what the app's own fetch put in a request with no answer", () => {
    const chunk = chunkOf({
      kind: "http-result",
      status: 0,
      error: "Network request failed",
      data: { success: false, message: "upstream refused x-api-key=s3cret" },
    });

    expect(chunk).toMatchObject({ data: { success: false, message: UNSHOWN_CAUSE } });
    expect(JSON.stringify(chunk)).not.toContain("s3cret");
  });

  it("keeps the platform's reason, and an upstream's answer whole", () => {
    const unanswered = chunkOf({
      kind: "http-result",
      status: 0,
      data: { success: false, message: "getaddrinfo ENOTFOUND api.test", code: "ENOTFOUND" },
    });
    const answered = chunkOf({
      kind: "http-result",
      status: 404,
      data: { token: "its own field" },
    });

    expect(unanswered).toMatchObject({
      data: { success: false, code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" },
    });
    expect(answered).toMatchObject({ data: { token: "its own field" } });
  });

  it("has the token cut from a stream's error", () => {
    expect(sanitizeError({ rid: "r1", error: { message: REFUSED } })).toEqual({
      rid: "r1",
      error: { message: SHOWN },
    });
  });
});

describe("an agent's replay", () => {
  it("is told the error with its token cut", () => {
    const chunk = chunkOf({ kind: "http-result", status: 500, error: REFUSED });

    const outcome = replayedOutcome("pg_1", plan, { ok: true, chunks: [chunk], durationMs: 3 });

    expect(outcome).toMatchObject({ ok: true, data: { error: SHOWN } });
    expect(JSON.stringify(outcome)).not.toContain("B34rer");
  });

  it("is told why the call was not sent with its token cut", () => {
    const refused = sanitizeError({ rid: "r1", error: { message: REFUSED } });

    const outcome = replayedOutcome("pg_1", plan, {
      ok: false,
      message: refused?.error.message ?? "",
    });

    expect(JSON.stringify(outcome)).not.toContain("B34rer");
  });
});

describe("an event a runtime sent", () => {
  it("has the token cut from a request's failure and its cause", () => {
    const event = withShownErrorTexts({
      type: "request:error",
      requestId: "r1",
      error: {
        type: "network",
        message: REFUSED,
        cause: { message: "upstream refused x-api-key=s3cret" },
      },
    });

    expect(event.error).toEqual({
      type: "network",
      message: SHOWN,
      cause: { message: UNSHOWN_CAUSE },
    });
  });

  it("has the token cut from a fetch's, a middleware's and a stream's failure", () => {
    expect(withShownErrorTexts({ type: "http:fetch:error", message: REFUSED })).toEqual({
      type: "http:fetch:error",
      message: SHOWN,
    });
    expect(
      withShownErrorTexts({ type: "middleware:error", error: "refused token=s3cret" }),
    ).toEqual({ type: "middleware:error", error: "refused token=[redacted]" });
    expect(withShownErrorTexts({ type: "stream:error", error: "closed Bearer B34rer" })).toEqual({
      type: "stream:error",
      error: "closed Bearer [redacted]",
    });
  });

  it("is passed on as it was when it holds no error's text", () => {
    const event = { type: "request:end", requestId: "r1", data: { token: "an answer's field" } };

    expect(withShownErrorTexts(event)).toBe(event);
  });
});
