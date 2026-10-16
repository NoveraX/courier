/**
 * Studio's one-time pass at the proxy's gate.
 *
 * With `browsersOnly`, a request no browser sent is let through only when
 * it carries a pass the redeemer on the global object — Studio's runtime,
 * attached in this process — redeems, in development, and then past
 * `browsersOnly` alone: the host, the endpoint's mark, the rate limit still
 * hold. Every other pass is a request without one, answered exactly alike.
 * The pass header never goes past the gate, wherever a source names it.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { redeemStudioPass, takeStudioPass } from "../src/adapter/studio-pass-gate";
import { courier, defineApi } from "../src/define/index";
import { studioHooks } from "../src/studio";
import { STUDIO_PASS_HEADER, STUDIO_PASS_REDEEMER } from "../src/studio/studio-pass";

const { endpoint, stream } = courier();
const PASS = "P".repeat(43);

let upstream: Server;
let upstreamURL: string;
let upstreamSaw: string[][] = [];
let live: Set<string>;
let redeemer: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  upstreamSaw = [];
  upstream = createServer((req, res) => {
    upstreamSaw.push(Object.keys(req.headers));
    res.writeHead(200, { "content-type": "application/json" }).end("{}");
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  upstreamURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  live = new Set([PASS]);
  redeemer = vi.fn((pass: unknown) => typeof pass === "string" && live.delete(pass));
  Reflect.set(globalThis, STUDIO_PASS_REDEEMER, redeemer);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, STUDIO_PASS_REDEEMER);
  studioHooks.onRequestEnd = undefined;
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

function proxyOf(config: Parameters<typeof createHandler>[0] = {}) {
  const api = defineApi({
    expose: true,
    baseURL: upstreamURL,
    allowedHeaders: [STUDIO_PASS_HEADER],
    endpoints: {
      read: endpoint.get("read"),
      hidden: endpoint.get("hidden").expose(false),
      feed: stream.response<{ n: number }>().implement(async function* () {
        yield { data: { n: 1 } };
      }),
    },
  });
  return createHandler({ sources: { api }, browsersOnly: true, ...config });
}

function read(
  path = "_s=api&_m=read",
  headers: Record<string, string> = {},
  host = "app.localhost",
): Request {
  return new Request(`http://${host}/api/request?${path}`, { headers });
}

async function answerOf(response: Response) {
  return { status: response.status, body: await response.text() };
}

describe("a request carrying Studio's pass, with browsersOnly", () => {
  it("is let through once, and refused as a script is the second time", async () => {
    const proxy = proxyOf();

    const first = await proxy.handle(read(undefined, { [STUDIO_PASS_HEADER]: PASS }));
    const again = await proxy.handle(read(undefined, { [STUDIO_PASS_HEADER]: PASS }));

    expect(first.status).toBe(200);
    expect(again.status).toBe(403);
    expect(await again.json()).toMatchObject({ code: "BROWSERS_ONLY" });
    expect(redeemer).toHaveBeenCalledTimes(2);
  });

  it("is answered exactly as a request without one, when its pass is unknown, used or expired", async () => {
    const proxy = proxyOf();
    const without = await answerOf(await proxy.handle(read()));
    live.clear();

    const unknown = await answerOf(
      await proxy.handle(read(undefined, { [STUDIO_PASS_HEADER]: "Q".repeat(43) })),
    );
    const spent = await answerOf(
      await proxy.handle(read(undefined, { [STUDIO_PASS_HEADER]: PASS })),
    );

    expect(unknown).toEqual(without);
    expect(spent).toEqual(without);
    expect(without.status).toBe(403);
  });

  it("is refused when nothing in the process redeems passes", async () => {
    Reflect.deleteProperty(globalThis, STUDIO_PASS_REDEEMER);

    const response = await proxyOf().handle(read(undefined, { [STUDIO_PASS_HEADER]: PASS }));

    expect(response.status).toBe(403);
  });

  it("is refused in production, and the redeemer never asked", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await proxyOf().handle(read(undefined, { [STUDIO_PASS_HEADER]: PASS }));

    expect(response.status).toBe(403);
    expect(redeemer).not.toHaveBeenCalled();
    expect(live.has(PASS)).toBe(true);
  });

  it("is refused with a pass of any other shape, and the redeemer never asked", async () => {
    const proxy = proxyOf();
    for (const pass of ["short", `${PASS}x`, `${"P".repeat(42)}=`, `${PASS}, ${PASS}`]) {
      expect((await proxy.handle(read(undefined, { [STUDIO_PASS_HEADER]: pass }))).status).toBe(
        403,
      );
    }

    expect(redeemer).not.toHaveBeenCalled();
  });

  it("is let past browsersOnly alone: a host the app does not serve is still answered 421", async () => {
    const proxy = proxyOf({ allowedHosts: ["app.example"] });

    const response = await proxy.handle(
      read(undefined, { [STUDIO_PASS_HEADER]: PASS }, "rebound.example"),
    );

    expect(response.status).toBe(421);
    expect(redeemer).not.toHaveBeenCalled();
  });

  it("is let past browsersOnly alone: an endpoint no mark opens is still refused", async () => {
    const response = await proxyOf().handle(
      read("_s=api&_m=hidden", { [STUDIO_PASS_HEADER]: PASS }),
    );

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false });
    expect(body).not.toMatchObject({ code: "BROWSERS_ONLY" });
    expect(upstreamSaw).toEqual([]);
  });

  it("is let past browsersOnly alone: a caller past its budget is still answered 429", async () => {
    live.add("R".repeat(43));
    const proxy = proxyOf({ rateLimit: { requests: 1, window: 60_000 } });

    const first = await proxy.handle(read(undefined, { [STUDIO_PASS_HEADER]: PASS }));
    const second = await proxy.handle(read(undefined, { [STUDIO_PASS_HEADER]: "R".repeat(43) }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it("opens a stream once let through", async () => {
    const request = new Request("http://app.localhost/api/sse?_s=api&_m=feed", {
      headers: { accept: "text/event-stream", [STUDIO_PASS_HEADER]: PASS },
    });

    const response = await proxyOf().handleSSE(request);

    expect(response.status).toBe(200);
    await response.body?.cancel();
  });
});

describe("the pass header", () => {
  it("never reaches the upstream or Studio's events, though the source names it", async () => {
    const sent: Array<Record<string, string>> = [];
    studioHooks.onRequestEnd = (event) => {
      sent.push(event.requestHeaders);
    };

    await proxyOf().handle(read(undefined, { [STUDIO_PASS_HEADER]: PASS }));

    expect(upstreamSaw).toHaveLength(1);
    expect(upstreamSaw[0]).not.toContain(STUDIO_PASS_HEADER);
    expect(Object.keys(sent[0] ?? {})).not.toContain(STUDIO_PASS_HEADER);
  });

  it("is taken off a request a browser sent, and off one when browsersOnly is off", async () => {
    const browser = await proxyOf().handle(
      read(undefined, { origin: "http://app.localhost", [STUDIO_PASS_HEADER]: "Q".repeat(43) }),
    );
    const open = await proxyOf({ browsersOnly: false }).handle(
      read(undefined, { [STUDIO_PASS_HEADER]: PASS }),
    );

    expect([browser.status, open.status]).toEqual([200, 200]);
    expect(upstreamSaw.flat()).not.toContain(STUDIO_PASS_HEADER);
    expect(redeemer).not.toHaveBeenCalled();
    expect(live.has(PASS)).toBe(true);
  });

  it("is kept, and its pass never redeemed, on a request whose headers cannot change", () => {
    const request = read(undefined, { [STUDIO_PASS_HEADER]: PASS });
    vi.spyOn(request.headers, "delete").mockImplementation(() => {
      throw new TypeError("immutable");
    });

    expect(takeStudioPass(request)).toBeUndefined();
    expect(request.headers.get(STUDIO_PASS_HEADER)).toBe(PASS);
  });
});

describe("redeeming a pass", () => {
  it("honours none where there is no process to say this is development", () => {
    vi.stubGlobal("process", undefined);
    let redeemed: boolean;
    try {
      redeemed = redeemStudioPass(PASS);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(redeemed).toBe(false);
    expect(redeemer).not.toHaveBeenCalled();
  });

  it("honours only a redeemer that answers true itself", () => {
    Reflect.set(globalThis, STUDIO_PASS_REDEEMER, () => "yes");

    expect(redeemStudioPass(PASS)).toBe(false);
    expect(redeemStudioPass(undefined)).toBe(false);
  });
});
