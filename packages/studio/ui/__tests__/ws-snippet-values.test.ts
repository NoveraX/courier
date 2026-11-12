/**
 * A WebSocket snippet writes each value of its request as the place it
 * goes reads it, whatever the value holds: the socket's address as a
 * string, the frames as JSON in code, each one a single word of the shell,
 * and websocat's address as a socket's URL. Run as written, the browser
 * code opens the socket at the address it was given and sends the frames
 * the request had, and it holds nothing that ends the page's script or the
 * line around it. The values are made up; nothing is sent.
 */
import { describe, expect, it } from "vitest";
import { requestSnippet } from "@/features/requests/request-snippets";
import type { RequestEntry } from "@/store";
import { requestEntry } from "./request-entry-fixture";
import { shellRead } from "./shell-read";

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
/* What a string, a template, a page's script and a line each end or change at. */
const AWKWARD = [
  'a"b',
  "'c",
  "`d",
  "\\e",
  "$",
  "{f}",
  "</script>",
  "<!--g-->",
  LINE_SEPARATOR,
  "h",
  PARAGRAPH_SEPARATOR,
].join("");
/* An address as a URL parser keeps it: a quote in the host, a backslash in the query. */
const ADDRESS = "ws://we\"ird/p'ath?q=a\\b";
/* Variables with a key an object literal reads as the prototype's, not as a key. */
const VARIABLES: unknown = JSON.parse(
  `{"room":${JSON.stringify(AWKWARD)},"__proto__":{"kept":true}}`,
);

function room(fields: Partial<RequestEntry>): RequestEntry {
  return requestEntry({ transport: "ws", method: "room", variables: VARIABLES, ...fields });
}

/* The browser snippet run as written: where its socket opened, and the frames it sent once let in. */
function runInBrowser(code: string): { opened: string[]; sent: unknown[] } {
  const opened: string[] = [];
  const sent: unknown[] = [];
  const sockets: Socket[] = [];
  class Socket {
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    constructor(address: string) {
      opened.push(address);
      sockets.push(this);
    }
    send(frame: string) {
      sent.push(JSON.parse(frame));
    }
  }
  new Function("WebSocket", "console", code)(Socket, { log: () => undefined });
  for (const socket of sockets) {
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ type: "auth_ok" }) });
  }
  return { opened, sent };
}

describe("the browser snippet of a WebSocket request", () => {
  it("opens the socket at its address and sends its frames, whatever they hold", () => {
    const { code } = requestSnippet(
      room({ url: ADDRESS, requestHeaders: { "x-note": AWKWARD } }),
      "browser",
    );

    const { opened, sent } = runInBrowser(code);

    expect(opened).toEqual([ADDRESS]);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ type: "auth", payload: { headers: { "x-note": AWKWARD } } });
    expect(sent[1]).toMatchObject({ type: "subscribe" });
    expect(JSON.stringify((sent[1] as { payload: unknown }).payload)).toBe(
      JSON.stringify(VARIABLES),
    );
  });

  it("holds nothing that ends a page's script, or a line, around it", () => {
    const { code } = requestSnippet(
      room({ url: ADDRESS, requestHeaders: { "x-note": AWKWARD } }),
      "browser",
    );

    expect(code).not.toMatch(/<\/|<!--/);
    expect(code).not.toContain(LINE_SEPARATOR);
    expect(code).not.toContain(PARAGRAPH_SEPARATOR);
  });
});

describe("the websocat snippet of a WebSocket request", () => {
  it("writes each value as one word of the shell, its shape the same as a plain request's", () => {
    const plain = shellRead(
      requestSnippet(
        room({
          url: "ws://localhost:5173/ws",
          variables: { room: "a" },
          requestHeaders: { "x-note": "n" },
        }),
        "shell",
      ).code,
    );
    const awkward = shellRead(
      requestSnippet(room({ url: ADDRESS, requestHeaders: { "x-note": AWKWARD } }), "shell").code,
    );

    expect(awkward.shape).toBe(plain.shape);
    expect(awkward.words).toContain(ADDRESS);
    expect(awkward.words).toContain(`x-note: ${AWKWARD}`);
    const subscribe = awkward.words.find((word) => word.startsWith('{"type":"subscribe"'));
    expect(JSON.stringify(JSON.parse(subscribe ?? "{}").payload)).toBe(JSON.stringify(VARIABLES));
  });

  it.each([
    ["the path a recorded request is given", undefined, "ws://<host>/api/users/room"],
    ["an HTTP address", "http://localhost:5173/ws", "ws://localhost:5173/ws"],
    ["an HTTPS address", "https://api.example.com/ws", "wss://api.example.com/ws"],
    ["a scheme in capitals", "WSS://api.example.com/ws", "wss://api.example.com/ws"],
    ["another kind of websocat address", "literal:hello", "ws://<host>/literal:hello"],
  ])("gives websocat %s as a socket's URL", (_what, url, address) => {
    const { words } = shellRead(
      requestSnippet(room({ url, source: "api", group: "users" }), "shell").code,
    );

    expect(words[words.indexOf("websocat") + 1]).toBe(address);
  });
});
