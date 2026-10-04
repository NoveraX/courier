/**
 * The request a Web-standard adapter hands the proxy when the framework's own
 * signal does not say the client has gone, and the adapter can see the
 * connection that would.
 */
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import { handleWhileConnected } from "../src/adapter/handle-while-connected";

/** A connection as Node reports it: an emitter that closes once. */
class Connection extends EventEmitter {
  destroyed = false;

  close(): void {
    this.destroyed = true;
    this.emit("close");
  }
}

function post(signal?: AbortSignal): Request {
  return new Request("http://app.test/api/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"source":"api","method":"list"}',
    signal: signal ?? null,
  });
}

describe("handleWhileConnected", () => {
  it("aborts the handler's request when the connection closes", async () => {
    const connection = new Connection();
    let seen: AbortSignal | undefined;

    const answer = handleWhileConnected(
      async (request) => {
        seen = request.signal;
        connection.close();
        return new Response("{}");
      },
      post(),
      connection,
    );

    await answer;
    expect(seen?.aborted).toBe(true);
  });

  it("still follows the framework's own signal", async () => {
    const framework = new AbortController();
    let seen: AbortSignal | undefined;

    await handleWhileConnected(
      async (request) => {
        seen = request.signal;
        framework.abort();
        return new Response("{}");
      },
      post(framework.signal),
      new Connection(),
    );

    expect(seen?.aborted).toBe(true);
  });

  it("starts aborted when the client had already gone", async () => {
    const connection = new Connection();
    connection.close();
    let aborted: boolean | undefined;

    await handleWhileConnected(
      async (request) => {
        aborted = request.signal.aborted;
        return new Response("{}");
      },
      post(),
      connection,
    );

    expect(aborted).toBe(true);
  });

  it("stops watching the connection once the handler has answered", async () => {
    const connection = new Connection();
    let seen: AbortSignal | undefined;

    await handleWhileConnected(
      async (request) => {
        seen = request.signal;
        return new Response("{}");
      },
      post(),
      connection,
    );
    connection.close();

    expect(connection.listenerCount("close")).toBe(0);
    expect(seen?.aborted).toBe(false);
  });

  it("hands the body over intact", async () => {
    const body = await handleWhileConnected(
      async (request) => new Response(await request.text()),
      post(),
      new Connection(),
    );

    expect(await body.text()).toBe('{"source":"api","method":"list"}');
  });

  it("passes the request through when there is no connection to watch", async () => {
    const request = post();
    let received: Request | undefined;

    await handleWhileConnected(
      async (given) => {
        received = given;
        return new Response("{}");
      },
      request,
      undefined,
    );

    expect(received).toBe(request);
  });
});
