import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { ConfigurationError, HTTPError, MissingTokenError } from "../../src/errors";
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
      endpoints: {
        me: endpoint.get("me"),
        rename: endpoint.post("me").variables<{ name: string }>(),
      },
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
    const client = clientFor(
      upstream.url,
      authMiddleware({ getToken: () => "stale", refreshToken }),
    );

    const call = client.me();

    await expect(call).rejects.toBeInstanceOf(HTTPError);
    await expect(call).rejects.toMatchObject({ status: 401 });
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(upstream.seen).toHaveLength(2);
  });

  it("does not refresh on a failure other than 401", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 403, { message: "forbidden" }));
    const refreshToken = vi.fn(() => "fresh");
    const client = clientFor(
      upstream.url,
      authMiddleware({ getToken: () => "stale", refreshToken }),
    );

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

    /* Three calls the upstream tells apart, so three are refused rather than one shared. */
    const calls = Promise.all(
      [1, 2, 3].map((n) => client.with({ headers: { "x-call": String(n) } }).me()),
    );
    /* All three refused before the one refresh they share ends. */
    await vi.waitFor(() => expect(seen).toHaveLength(3));
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
    const client = clientFor(
      upstream.url,
      authMiddleware({ getToken: () => "stale", refreshToken }),
    );

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

/* Made up, and joined at run time so no literal sits in the source for a secret scanner. */
const SECRET = ["Zq9x7", "Kp2Lm", "4Nw8"].join("");

/** An upstream that answers every request, recording what it saw. */
async function answeringAll(): Promise<Upstream> {
  upstream = await startUpstream((_req, res) => sendJson(res, 200, { ok: true }));
  return upstream;
}

describe("authMiddleware without a token", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty string", ""],
  ])("sends no Authorization header when the token is %s", async (_said, token) => {
    const { url, seen } = await answeringAll();
    const client = clientFor(url, authMiddleware({ getToken: () => token }));

    await expect(client.me()).resolves.toEqual({ ok: true });

    expect(seen[0]?.headers.authorization).toBeUndefined();
  });

  it("leaves the header a call set itself where there is no token", async () => {
    const { url, seen } = await answeringAll();
    const client = clientFor(url, authMiddleware({ getToken: async () => undefined }));

    await client.with({ headers: { authorization: "Basic YW5hOnB3" } }).me();

    expect(seen[0]?.headers.authorization).toBe("Basic YW5hOnB3");
  });

  it("still sends the token once there is one", async () => {
    const { url, seen } = await answeringAll();
    const client = clientFor(url, authMiddleware({ getToken: () => "t0k3n" }));

    await client.me();

    expect(seen[0]?.headers.authorization).toBe("Bearer t0k3n");
  });

  it("refuses a call that requires a token before sending it, with a MissingTokenError", async () => {
    const { url, seen } = await answeringAll();
    const client = clientFor(url, authMiddleware({ getToken: () => null, required: true }));

    const error: unknown = await client.me().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(MissingTokenError);
    expect(error).toMatchObject({ code: "TOKEN_MISSING", header: "Authorization" });
    expect(seen).toHaveLength(0);
  });

  it("signs in through an API that sends the token, before there is one, and refreshes on its 401", async () => {
    let session: string | undefined;
    upstream = await startUpstream((req, res) => {
      if (req.url === "/login") return sendJson(res, 200, { token: "fresh" });
      if (req.headers.authorization === "Bearer fresh") return sendJson(res, 200, { user: "ada" });
      sendJson(res, 401, { message: "sign in first" });
    });
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: upstream.url,
        middleware: [authMiddleware({ getToken: () => session, refreshToken: () => session })],
        endpoints: {
          login: endpoint.post("login").response<{ token: string }>(),
          me: endpoint.get("me"),
        },
      }),
    );

    const { token } = await client.login();
    session = token;

    await expect(client.me()).resolves.toEqual({ user: "ada" });
    expect(upstream.seen[0]?.headers.authorization).toBeUndefined();
  });
});

describe("a token no header can carry", () => {
  it("is refused before anything is sent, without repeating it", async () => {
    const { url, seen } = await answeringAll();
    const client = clientFor(url, authMiddleware({ getToken: () => `${SECRET}\r\nX-Injected: 1` }));

    const error: unknown = await client.me().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error).toMatchObject({ code: "HEADER_VALUE_INVALID" });
    expect(String((error as Error).message)).not.toContain(SECRET);
    expect(seen).toHaveLength(0);
  });

  it("is sent as fetch sends it when the line break is only at its end, which fetch trims", async () => {
    const { url, seen } = await answeringAll();
    const client = clientFor(url, authMiddleware({ getToken: () => "t0k3n\n" }));

    await client.me();

    expect(seen[0]?.headers.authorization).toBe("Bearer t0k3n");
  });

  it.each([
    ["a header name with a space", { header: "X Api Key" }],
    ["a scheme with a colon", { scheme: "Bearer:" }],
    ["an option it does not have", { tokenHeader: "x" }],
  ])("refuses %s where the middleware is made", (_said, extra) => {
    expect(() => authMiddleware({ getToken: () => "t", ...extra })).toThrow(
      expect.objectContaining({ code: "AUTH_OPTIONS_INVALID" }),
    );
  });
});

describe("one refresh for many calls", () => {
  it("refreshes once for a hundred calls refused together, however late each refusal comes", async () => {
    /* Half the stale calls are refused at once, the other half only once the refresh is over. */
    let refreshed: () => void = () => {};
    const over = new Promise<void>((resolve) => {
      refreshed = resolve;
    });
    upstream = await startUpstream((req, res, index) => {
      if (req.headers.authorization === "Bearer fresh") return sendJson(res, 200, { user: "ada" });
      if (index < 50) return sendJson(res, 401, { message: "token expired" });
      void over.then(() => sendJson(res, 401, { message: "token expired" }));
    });
    const refreshToken = vi.fn(async () => {
      await Promise.resolve();
      return "fresh";
    });
    const middleware = authMiddleware({ getToken: () => "stale", refreshToken });
    const client = clientFor(upstream.url, middleware);

    const calls = Promise.all(
      Array.from({ length: 100 }, (_, n) => client.with({ headers: { "x-call": String(n) } }).me()),
    );
    await vi.waitFor(() => expect(refreshToken).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(
        upstream?.seen.filter((r) => r.headers.authorization === "Bearer fresh").length,
      ).toBeGreaterThan(0),
    );
    refreshed();

    await expect(calls).resolves.toHaveLength(100);
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });

  it("rejects every call waiting on a refresh that fails with its error, and tries again next time", async () => {
    const { url } = await acceptingOnlyFresh();
    const refreshToken = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("refresh token revoked"))
      .mockResolvedValueOnce("fresh");
    const client = clientFor(url, authMiddleware({ getToken: () => "stale", refreshToken }));

    await expect(client.me()).rejects.toThrow("refresh token revoked");
    await expect(client.me()).resolves.toEqual({ user: "ada" });
    expect(refreshToken).toHaveBeenCalledTimes(2);
  });

  it("rejects with the 401 when the refresh finds no token to give", async () => {
    const { url, seen } = await acceptingOnlyFresh();
    const client = clientFor(
      url,
      authMiddleware({ getToken: () => "stale", refreshToken: () => undefined }),
    );

    await expect(client.me()).rejects.toMatchObject({ status: 401 });
    expect(seen).toHaveLength(1);
  });

  it("does not refresh for a call whose body cannot be sent again", async () => {
    const { url, seen } = await acceptingOnlyFresh();
    const refreshToken = vi.fn(() => "fresh");
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: url,
        middleware: [authMiddleware({ getToken: () => "stale", refreshToken })],
        endpoints: { upload: endpoint.post("upload").variables<ReadableStream<Uint8Array>>() },
      }),
    );

    await expect(client.upload(new Blob(["chunk"]).stream())).rejects.toMatchObject({
      status: 401,
    });
    expect(refreshToken).not.toHaveBeenCalled();
    expect(seen).toHaveLength(1);
  });
});
