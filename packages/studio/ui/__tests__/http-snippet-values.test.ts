/**
 * The cURL, fetch and stream snippets write each value of a request as the
 * place it goes reads it: one word of the shell for the method, the
 * address, each header and the body; a string or JSON in code for fetch
 * and EventSource; and a comment that the name of the file it names cannot
 * end early. Run as written, the code sends what the request had. The
 * values are made up; nothing is sent.
 */
import { describe, expect, it } from "vitest";
import { requestSnippet } from "@/features/requests/request-snippets";
import { buildCurlSnippet, buildFetchSnippet } from "@/lib/snippets";
import type { RequestEntry } from "@/store";
import { AWKWARD, expectNothingEndsTheCode, LINE_SEPARATOR, runCode } from "./awkward-text";
import { requestEntry } from "./request-entry-fixture";
import { shellRead } from "./shell-read";

/* An address as a URL parser keeps it: a quote in the host, an apostrophe in the path, a backslash in the query. */
const ADDRESS = "http://we\"ird/p'ath?q=a\\b";
/* A method HTTP takes as a token, which the shell reads as a pipe. */
const TOKEN_METHOD = "LIST|ALL";
/* A body with a key an object literal reads as the prototype's, not as a key. */
const BODY: unknown = JSON.parse(`{"note":${JSON.stringify(AWKWARD)},"__proto__":{"kept":true}}`);
/* What the shell reads as it is: anything else outside quotes is its own syntax. */
const PLAIN = /^[\w@%+:,./\s-]*$/;

function stream(fields: Partial<RequestEntry>): RequestEntry {
  return requestEntry({ transport: "sse", method: "events", ...fields });
}

describe("the cURL snippet", () => {
  it("writes the method, the address, each header and the body as one word each", () => {
    const { words, bare } = shellRead(
      buildCurlSnippet({
        url: ADDRESS,
        method: TOKEN_METHOD,
        headers: { "x-note": AWKWARD },
        body: BODY,
      }),
    );

    expect(bare).toMatch(PLAIN);
    expect(words).toEqual([
      "curl",
      "-X",
      TOKEN_METHOD,
      ADDRESS,
      "-H",
      `x-note: ${AWKWARD}`,
      "-H",
      "Content-Type: application/json",
      "-d",
      JSON.stringify(BODY),
    ]);
  });
});

describe("the fetch snippet", () => {
  it("sends the address, the method, each header and the body it was given", async () => {
    const method = 'A"B\\C';
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const code = buildFetchSnippet({
      url: ADDRESS,
      method,
      headers: { "x-note": AWKWARD },
      body: BODY,
    });

    await runCode(code, {
      fetch: async (url: string, init: RequestInit) => calls.push({ url, init }),
    });

    expect(calls).toEqual([
      {
        url: ADDRESS,
        init: {
          method,
          headers: { "x-note": AWKWARD, "Content-Type": "application/json" },
          body: JSON.stringify(BODY),
        },
      },
    ]);
    expectNothingEndsTheCode(code);
  });

  it.each([
    ["a line end", "part one\npart two.json"],
    ["a line separator", `part one${LINE_SEPARATOR}two.json`],
  ])(
    "names the whole body's file with %s in it in a comment that holds all of it",
    async (_what, bodyFile) => {
      const code = buildFetchSnippet({
        url: "http://localhost:3000/api/import",
        method: "POST",
        bodyFile,
      });
      const sent: unknown[] = [];

      await runCode(code, {
        wholeBody: { all: true },
        fetch: async (_url: string, init: RequestInit) => sent.push(init.body),
      });

      expect(sent).toEqual([JSON.stringify({ all: true })]);
      expectNothingEndsTheCode(code);
    },
  );
});

describe("the stream snippets", () => {
  it("give cURL the address and each header as one word each", () => {
    const request = stream({ url: ADDRESS, requestHeaders: { "x-note": AWKWARD } });

    const { words, bare } = shellRead(requestSnippet(request, "shell").code);

    expect(bare).toMatch(PLAIN);
    expect(words).toEqual([
      "curl",
      "-N",
      ADDRESS,
      "-H",
      "accept: text/event-stream",
      "-H",
      `x-note: ${AWKWARD}`,
    ]);
  });

  it("open the page's EventSource at the address, and listen for the event by its name", async () => {
    const opened: string[] = [];
    const listened: string[] = [];
    class Source {
      constructor(url: string) {
        opened.push(url);
      }
      addEventListener(type: string) {
        listened.push(type);
      }
    }
    const events = [{ seq: 1, eventType: AWKWARD, dataSize: 2, timestamp: 1 }];
    const { code } = requestSnippet(stream({ url: ADDRESS, streamEvents: events }), "browser");

    await runCode(code, { EventSource: Source, console: { log: () => undefined } });

    expect(opened).toEqual([ADDRESS]);
    expect(listened).toEqual([AWKWARD]);
    expectNothingEndsTheCode(code);
  });
});
