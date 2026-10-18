/**
 * What Studio passes on of a runtime's answer to a Playground call: to the
 * page that asked — one with Studio's token — as the runtime sent it, a
 * request with no answer keeping its cause and no more; to an agent's
 * replay, and into the Playground's history, with every credential an
 * error's text quoted cut — a header value read with its line break, a
 * token the app's own fetch put in its message, one in a redirect's
 * Location.
 */
import { describe, expect, it } from "vitest";

import { replayedOutcome } from "../src/server/mcp/replay-outcome";
import type { PlannedReplay } from "../src/server/mcp/replay-plan";
import { sanitizeChunk, sanitizeError } from "../src/server/runtime-playground-chunk-sanitize";
import { withoutCredentials } from "../src/server/storage/without-credentials";

const REFUSED = 'Headers.append: "Bearer B34rer\nx" is an invalid header value.';
const CUT = 'Headers.append: "[redacted]" is an invalid header value.';

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

describe("a Playground call's result, for the page that asked", () => {
  it("keeps the error's text as the runtime sent it", () => {
    expect(chunkOf({ kind: "http-result", status: 500, error: REFUSED })).toEqual({
      kind: "http-result",
      status: 500,
      error: REFUSED,
    });
    expect(sanitizeError({ rid: "r1", error: { message: REFUSED } })).toEqual({
      rid: "r1",
      error: { message: REFUSED },
    });
  });

  it("keeps a request with no answer's cause and no more, and an upstream's answer whole", () => {
    const unanswered = chunkOf({
      kind: "http-result",
      status: 0,
      data: { success: false, message: "getaddrinfo ENOTFOUND api.test", code: "ENOTFOUND", x: 1 },
    });
    const answered = chunkOf({
      kind: "http-result",
      status: 404,
      data: { token: "its own field" },
    });

    expect(unanswered).toMatchObject({
      data: { success: false, code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.test" },
    });
    expect(unanswered).not.toHaveProperty("data.x");
    expect(answered).toMatchObject({ data: { token: "its own field" } });
  });
});

describe("an agent's replay", () => {
  it("is told the error, the cause and the redirect's Location with their credentials cut", () => {
    const result = chunkOf({ kind: "http-result", status: 500, error: REFUSED });
    const unanswered = chunkOf({
      kind: "http-result",
      status: 0,
      data: { success: false, code: "ECONNREFUSED", message: "connect https://ana:pw@api.test/x" },
    });
    const redirected = chunkOf({
      kind: "http-result",
      status: 307,
      headers: { location: "http://u:pa55@other.example/cb?token=s3cret" },
    });

    const outcomes = [result, unanswered, redirected].map((chunk) =>
      replayedOutcome("pg_1", plan, { ok: true, chunks: [chunk], durationMs: 3 }),
    );

    expect(outcomes[0]).toMatchObject({ ok: true, data: { error: CUT } });
    expect(outcomes[1]).toMatchObject({
      data: {
        answer: { success: false, code: "ECONNREFUSED", message: "connect https://api.test/x" },
      },
    });
    expect(outcomes[2]).toMatchObject({
      data: { headers: { location: "http://other.example/cb?token=[redacted]" } },
    });
    expect(JSON.stringify(outcomes)).not.toMatch(/B34rer|pa55|s3cret|:pw@/);
  });

  it("is told why the call was not sent with its credentials cut", () => {
    const refused = sanitizeError({ rid: "r1", error: { message: REFUSED } });

    const outcome = replayedOutcome("pg_1", plan, {
      ok: false,
      message: refused?.error.message ?? "",
    });

    expect(JSON.stringify(outcome)).not.toContain("B34rer");
  });
});

describe("a Playground call in the history Studio writes down", () => {
  it("keeps the text it failed with, its result's error and its Location without their credentials", () => {
    const entry = withoutCredentials({
      id: "e1",
      rid: "r1",
      status: "error",
      response: "refused token=s3cret",
      responseHeaders: { location: "https://ana:pw@api.test/next?sig=abc123" },
      chunks: [
        { kind: "http-result", status: 502, error: REFUSED, headers: { "x-api-key": "k3y" } },
      ],
    });

    expect(entry).toMatchObject({
      response: "refused token=[redacted]",
      responseHeaders: { location: "https://api.test/next?sig=[redacted]" },
      chunks: [{ error: CUT, headers: { "x-api-key": "[redacted]" } }],
    });
  });
});
