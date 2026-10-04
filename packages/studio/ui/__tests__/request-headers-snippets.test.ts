/**
 * A request's headers by side, filtered, credentials marked — by the same
 * rule Studio's server keeps them out of what it writes down — and a
 * request written out as cURL, fetch or a Courier call, or for a stream
 * its shell tool and browser API, with the credentials' values left out.
 */
import { describe, expect, it } from "vitest";
import { isCredentialHeader } from "@/features/requests/credential-headers";
import { headerCount, headerGroupsOf, headersAsText } from "@/features/requests/header-groups";
import { requestSnippet, snippetLabels } from "@/features/requests/request-snippets";
import { isCredentialHeader as serverRule } from "../../src/server/storage/without-credentials";
import { requestEntry } from "./request-entry-fixture";

describe("a credential header", () => {
  it("is told the way Studio's server tells it", () => {
    const names = [
      "Authorization",
      "proxy-authorization",
      "Cookie",
      "set-cookie",
      "X-Api-Key",
      "x-auth-token",
      "x_session_id",
      "X-CSRF-Token",
      "content-type",
      "accept",
      "x-request-id",
      "author",
      "authority",
    ];

    for (const name of names)
      expect([name, isCredentialHeader(name)]).toEqual([name, serverRule(name)]);
    expect(isCredentialHeader("Authorization")).toBe(true);
    expect(isCredentialHeader("content-type")).toBe(false);
  });
});

describe("a request's headers", () => {
  const r = requestEntry({
    headers: { "content-type": "application/json", "set-cookie": "sid=1" },
    requestHeaders: { accept: "application/json", authorization: "Bearer t0k3n" },
    middlewareHeaders: { "x-retry-count": ["0", "1"] },
  });

  it("come by side, the middleware's last, credentials marked", () => {
    expect(headerGroupsOf(r, "")).toEqual([
      {
        key: "response",
        title: "Response headers",
        total: 2,
        rows: [
          { name: "content-type", value: "application/json", secret: false },
          { name: "set-cookie", value: "sid=1", secret: true },
        ],
      },
      {
        key: "request",
        title: "Request headers",
        total: 2,
        rows: [
          { name: "accept", value: "application/json", secret: false },
          { name: "authorization", value: "Bearer t0k3n", secret: true },
        ],
      },
      {
        key: "middleware",
        title: "Added by middleware",
        total: 1,
        rows: [{ name: "x-retry-count", value: "0, 1", secret: false }],
      },
    ]);
    expect(headerCount(r)).toBe(5);
  });

  it("are filtered by name or value, keeping each side's total", () => {
    const groups = headerGroupsOf(r, "JSON");

    expect(groups.map((g) => [g.rows.length, g.total])).toEqual([
      [1, 2],
      [1, 2],
      [0, 1],
    ]);
    expect(headerGroupsOf(requestEntry(), "").map((g) => g.key)).toEqual(["response", "request"]);
  });

  it("are copied as lines of name and value", () => {
    expect(headersAsText(headerGroupsOf(r, "")[1]?.rows ?? [])).toBe(
      "accept: application/json\nauthorization: Bearer t0k3n",
    );
  });
});

describe("a request written out", () => {
  const post = requestEntry({
    httpMethod: "POST",
    method: "create",
    url: "http://localhost:5173/api/users",
    variables: { name: "Ada", role: "admin" },
    requestHeaders: { "content-type": "application/json", authorization: "Bearer t0k3n" },
  });

  it("as cURL or fetch leaves the credential's value out, and says so", () => {
    const curl = requestSnippet(post, "shell");
    const fetchCode = requestSnippet(post, "browser");

    expect(curl.redacted).toBe(true);
    expect(curl.code).toContain("-X POST");
    expect(curl.code).toContain("-H 'authorization: <redacted>'");
    expect(curl.code).not.toContain("t0k3n");
    expect(fetchCode.code).toContain('"authorization": "<redacted>"');
    expect(requestSnippet(requestEntry(), "shell").redacted).toBe(false);
  });

  it("as a Courier call names the group and the endpoint, with the variables", () => {
    expect(requestSnippet(post, "courier").code).toBe(
      'const data = await caller.users.create({\n  name: "Ada",\n  role: "admin"\n});',
    );
    expect(
      requestSnippet(requestEntry({ group: undefined, method: "health" }), "courier").code,
    ).toBe("const data = await caller.health();");
  });

  it("for a stream, opens it with its shell tool, its browser API, or a Courier call", () => {
    const sse = requestEntry({
      transport: "sse",
      url: "http://localhost:5173/api/events",
      method: "events",
    });
    const ws = requestEntry({ transport: "ws", url: "ws://localhost:5173/ws", method: "room" });

    expect(snippetLabels(ws)).toEqual({
      shell: "websocat",
      browser: "Browser",
      courier: "Courier",
    });
    expect(snippetLabels(post)).toEqual({ shell: "cURL", browser: "fetch", courier: "Courier" });
    expect(requestSnippet(sse, "shell").code).toBe(
      "curl -N \\\n  'http://localhost:5173/api/events' \\\n  -H 'accept: text/event-stream'",
    );
    expect(requestSnippet(ws, "shell").code).toBe("websocat \\\n  'ws://localhost:5173/ws'");
    expect(requestSnippet(sse, "browser").code).toContain(
      'new EventSource("http://localhost:5173/api/events")',
    );
    expect(requestSnippet(ws, "browser").code).toContain('new WebSocket("ws://localhost:5173/ws")');
    expect(requestSnippet(sse, "courier").code).toBe(
      "for await (const event of caller.users.events()) {\n  console.log(event.data);\n}",
    );
    expect(requestSnippet(ws, "courier").code).toContain('channel.on("data"');
  });
});
