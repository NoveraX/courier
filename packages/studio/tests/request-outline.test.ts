/**
 * The outline of the request log an editor's figures and an agent's list of
 * requests are read from: each request's key events, without their bodies
 * and headers, and — as only an editor and an agent read it, past the page
 * that holds Studio's token — with an error's text and its cause cut.
 */
import { describe, expect, it } from "vitest";

import { createRequestOutline } from "../src/server/request-outline";

describe("the outline of the request log", () => {
  it("keeps a request's key events, without bodies or headers", () => {
    const outline = createRequestOutline([]);

    outline.see("r1", { type: "request:start", id: "r1", variables: { q: 1 } });
    outline.see("r1", { type: "http:fetch:start", requestId: "r1", url: "https://api.test" });
    outline.see("r1", { type: "request:end", requestId: "r1", data: [], headers: { a: "b" } });

    expect(outline.events()).toEqual([
      { type: "request:start", id: "r1" },
      { type: "request:end", requestId: "r1" },
    ]);
  });

  it("keeps how a stream's connection stands now, in place of how it stood, its cause cut", () => {
    const status = (failures: number) => ({
      type: "stream:status",
      requestId: "s1",
      status: "reconnecting",
      failures,
      cause: { code: "ECONNREFUSED", message: "connect https://ana:pw@api.test/feed" },
    });
    const outline = createRequestOutline([
      { id: "s1", event: { type: "stream:open", requestId: "s1" } },
    ]);

    outline.see("s1", status(1));
    outline.see("s1", { type: "stream:message", requestId: "s1", seq: 1 });
    outline.see("s1", status(2));

    expect(outline.events()).toEqual([
      { type: "stream:open", requestId: "s1" },
      { ...status(2), cause: { code: "ECONNREFUSED", message: "connect https://api.test/feed" } },
    ]);
  });

  it("keeps a failure's text and its cause with their credentials cut, as they arrive and as stored", () => {
    const failure = {
      type: "request:error",
      requestId: "r1",
      error: {
        type: "network",
        message: "fetch failed: token=s3cret",
        cause: { code: "ECONNREFUSED", message: "connect https://ana:pw@api.test/x" },
      },
    };
    const outline = createRequestOutline([{ id: "r0", event: { ...failure, requestId: "r0" } }]);

    outline.see("r1", failure);
    outline.see("r1", { type: "stream:error", requestId: "r1", error: "closed Bearer B34rer" });

    expect(outline.events()).toEqual([
      expect.objectContaining({
        requestId: "r0",
        error: expect.objectContaining({ message: "fetch failed: token=[redacted]" }),
      }),
      {
        type: "request:error",
        requestId: "r1",
        error: {
          type: "network",
          message: "fetch failed: token=[redacted]",
          cause: { code: "ECONNREFUSED", message: "connect https://api.test/x" },
        },
      },
      { type: "stream:error", requestId: "r1", error: "closed Bearer [redacted]" },
    ]);
  });
});
