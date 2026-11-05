/**
 * The browser code and the websocat command Studio writes for a WebSocket
 * request speak the protocol a Courier server and its mock speak: the
 * socket's first frame is `auth` of the protocol's version, the request's
 * topic is subscribed to once the server has let the socket in, and the
 * server's pings are answered. Each snippet, run against a mock, hears the
 * topic's event, and a credential shows in neither by its value.
 */
import { createMockServer, type MockServer } from "@noverax/courier-mock/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import NodeSocket from "ws";
import { REDACTED_VALUE, requestSnippet } from "@/features/requests/request-snippets";

let server: MockServer | undefined;
const opened: Array<{ close(): void }> = [];

afterEach(async () => {
  for (const socket of opened.splice(0)) socket.close();
  await server?.stop();
  server = undefined;
});

/** A mock whose `users.room` channel says welcome to each subscription, on the proxy's route. */
async function mockRoom(): Promise<string> {
  server = createMockServer({ port: 0, log: false });
  server.mock("users", "room").channel(() => ({
    onJoin: (ctx) => ctx.send("welcome"),
    onMessage: () => undefined,
  }));
  const { url } = await server.start();
  return `${url.replace(/^http/, "ws")}/api/ws`;
}

function roomRequest(url: string) {
  return {
    url,
    source: "api",
    group: "users",
    method: "room",
    transport: "ws" as const,
    variables: { room: "a" },
    requestHeaders: { authorization: "Bearer t0k3n", "x-tenant": "acme" },
  };
}

/* The words a shell reads from a command: single-quoted strings, with `'\''` for a quote. */
function quotedWords(command: string): string[] {
  return [...command.matchAll(/'((?:[^']|'\\'')*)'/g)].map((m) =>
    (m[1] ?? "").replaceAll("'\\''", "'"),
  );
}

/* What websocat is told by the command: where to connect, the headers, and the lines it sends. */
function websocatRun(command: string) {
  const words = quotedWords(command);
  const url = words.find((word) => word.startsWith("ws://")) ?? "";
  const headers = Object.fromEntries(
    words
      .filter((word) => /^[\w-]+: /.test(word))
      .map((word) => [word.slice(0, word.indexOf(":")), word.slice(word.indexOf(":") + 2)]),
  );
  const frames = words.filter((word) => word.startsWith("{"));
  return { url, headers, frames };
}

describe("the browser snippet of a WebSocket request", () => {
  it("hears the topic's event from a mock, its credentials left out", async () => {
    const url = await mockRoom();
    const { code, redacted } = requestSnippet(roomRequest(url), "browser");
    const logged: unknown[] = [];
    class Tracked extends WebSocket {
      constructor(address: string) {
        super(address);
        opened.push(this);
      }
    }

    new Function("WebSocket", "console", code)(Tracked, {
      log: (line: unknown) => logged.push(line),
    });

    await vi.waitFor(() =>
      expect(logged).toContainEqual(expect.objectContaining({ type: "data", payload: "welcome" })),
    );
    expect(redacted).toBe(true);
    expect(code).not.toContain("t0k3n");
    expect(code).toContain(REDACTED_VALUE);
  });
});

describe("the websocat snippet of a WebSocket request", () => {
  it("hears the topic's event from a mock with the lines it sends, its credentials left out", async () => {
    const url = await mockRoom();
    const { code, redacted } = requestSnippet(roomRequest(url), "shell");
    const run = websocatRun(code);
    const heard: Array<{ type?: string; payload?: unknown }> = [];

    const socket = new NodeSocket(run.url, { headers: run.headers });
    opened.push(socket);
    socket.on("message", (raw) => heard.push(JSON.parse(String(raw))));
    socket.on("open", () => {
      for (const frame of run.frames) socket.send(frame);
    });

    await vi.waitFor(() =>
      expect(heard).toContainEqual(expect.objectContaining({ type: "data", payload: "welcome" })),
    );
    expect(heard[0]?.type).toBe("auth_ok");
    expect(run.url).toBe(url);
    expect(run.headers).toEqual({ authorization: REDACTED_VALUE, "x-tenant": "acme" });
    expect(redacted).toBe(true);
    expect(code).not.toContain("t0k3n");
  });
});
