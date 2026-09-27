import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { courier } from "../../src/define/courier";
import { defineApi } from "../../src/define/api";
import { HTTPError } from "../../src/errors";
import { authMiddleware } from "../../src/middleware/index";
import type { WrapHandler } from "../../src/middleware/types";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

const { endpoint } = courier();

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

/** An upstream that accepts only `Bearer fresh`. */
async function acceptingOnlyFresh(): Promise<Upstream> {
  upstream = await startUpstream((req, res) => {
    if (req.headers.authorization === "Bearer fresh") sendJson(res, 200, { user: "ada" });
    else sendJson(res, 401, { message: "token expired" });
  });
  return upstream;
}

function clientFor(url: string, middleware: ReturnType<typeof authMiddleware>) {
  return createCaller(
    defineApi({
      name: "api",
      baseURL: url,
      middleware: [middleware],
      endpoints: { me: endpoint.get("me"), rename: endpoint.post("me").variables<{ name: string }>() },
    }),
  );
}

describe("authMiddleware against a real upstream", () => {
  it("refreshes the token and re-sends the request when the upstream answers 401", async () => {
    const { url, seen } = await acceptingOnlyFresh();
    const refreshToken = vi.fn(() => "fresh");
    const client = clientFor(url, authMiddleware({ getToken: () => "stale", refreshToken }));

    await expect(client.me()).resolves.toEqual({ user: "ada" });

    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(seen.map((r) => r.headers.authorization)).toEqual(["Bearer stale", "Bearer fresh"]);
  });

  it("re-sends a write with its body after refreshing", async () => {
    const bodies: string[] = [];
    upstream = await startUpstream((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        bodies.push(body);
        if (req.headers.authorization === "Bearer fresh") sendJson(res, 200, { ok: true });
        else sendJson(res, 401, { message: "token expired" });
      });
    });
    const client = clientFor(
      upstream.url,
      authMiddleware({ getToken: () => "stale", refreshToken: () => "fresh" }),
    );

    await expect(client.rename({ name: "Ada" })).resolves.toEqual({ ok: true });

    expect(bodies).toEqual(['{"name":"Ada"}', '{"name":"Ada"}']);
  });

  it("rejects with the second 401 and refreshes only once when the fresh token is refused too", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 401, { message: "revoked" }));
    const refreshToken = vi.fn(() => "fresh");
    const client = clientFor(upstream.url, authMiddleware({ getToken: () => "stale", refreshToken }));

    const call = client.me();

    await expect(call).rejects.toBeInstanceOf(HTTPError);
    await expect(call).rejects.toMatchObject({ status: 401 });
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(upstream.seen).toHaveLength(2);
  });

  it("does not refresh on a failure other than 401", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 403, { message: "forbidden" }));
    const refreshToken = vi.fn(() => "fresh");
    const client = clientFor(upstream.url, authMiddleware({ getToken: () => "stale", refreshToken }));

    await expect(client.me()).rejects.toMatchObject({ status: 403 });

    expect(refreshToken).not.toHaveBeenCalled();
    expect(upstream.seen).toHaveLength(1);
  });

  it("rejects with the 401 when no refreshToken is given", async () => {
    const { url, seen } = await acceptingOnlyFresh();
    const client = clientFor(url, authMiddleware({ getToken: () => "stale" }));

    await expect(client.me()).rejects.toMatchObject({ status: 401 });

    expect(seen).toHaveLength(1);
  });

  it("shares one refresh among requests that were refused together", async () => {
    const { url, seen } = await acceptingOnlyFresh();
    let release: (token: string) => void = () => {};
    const refreshToken = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const client = clientFor(url, authMiddleware({ getToken: () => "stale", refreshToken }));

    const calls = Promise.all([client.me(), client.me(), client.me()]);
    await vi.waitFor(() => expect(refreshToken).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    release("fresh");

    await expect(calls).resolves.toEqual([{ user: "ada" }, { user: "ada" }, { user: "ada" }]);
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(seen.filter((r) => r.headers.authorization === "Bearer fresh")).toHaveLength(3);
  });

  it("refreshes again for a 401 that arrives after an earlier refresh finished", async () => {
    let accepted = "fresh-1";
    upstream = await startUpstream((req, res) => {
      if (req.headers.authorization === `Bearer ${accepted}`) sendJson(res, 200, { user: "ada" });
      else sendJson(res, 401, { message: "token expired" });
    });
    let issued = 0;
    const refreshToken = vi.fn(() => `fresh-${++issued}`);
    const client = clientFor(upstream.url, authMiddleware({ getToken: () => "stale", refreshToken }));

    await client.me();
    accepted = "fresh-2";
    await client.me();

    expect(refreshToken).toHaveBeenCalledTimes(2);
  });
});

describe("authMiddleware inside a chain", () => {
  it("refreshes when an inner middleware answers 401 without throwing", async () => {
    let calls = 0;
    const handler = authMiddleware({
      getToken: () => "stale",
      refreshToken: () => "fresh",
    }).handler as WrapHandler;
    const ctx = { source: "api", method: "me", headers: new Headers() };

    const result = await handler(ctx, () => {
      calls++;
      const status = ctx.headers.get("Authorization") === "Bearer fresh" ? 200 : 401;
      return Promise.resolve({ status, data: null, headers: new Headers() });
    });

    expect(result.status).toBe(200);
    expect(calls).toBe(2);
  });
});
