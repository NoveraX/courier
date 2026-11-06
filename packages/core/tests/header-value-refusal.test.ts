/**
 * A header value no request can carry — a control character other than a
 * tab, a line break inside it among them, or a character past U+00FF — is
 * refused where a request's headers are put together for sending, before
 * anything is sent, naming the header and never the value: the platform's
 * own refusal can repeat the value whole, and a header's value is often a
 * credential. Inside means inside once the ends are trimmed as fetch trims
 * them, of tabs, spaces and line breaks alone. Every way a call is sent
 * goes through that one place — a direct call, a proxy client's, one the
 * proxy serves in this process, and the standalone fetch client.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import {
  _resetServerCapabilitiesForTests,
  provideServerCapability,
} from "../src/capabilities/provide-server-capability";
import { courier, defineApi } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { ConfigurationError } from "../src/errors";
import { createFetch } from "../src/fetch";
import { retryMiddleware } from "../src/middleware/index";
import { createProxyCaller } from "../src/proxy-caller";
import { inProcessRoute } from "../src/server/in-process-route";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { startUpstream } from "./helpers/middleware-upstream";

/* Made up, and joined at run time so no literal sits in the source for a secret scanner. */
const SECRET = ["Zq9x7", "Kp2Lm", "4Nw8"].join("");
const { endpoint } = courier();
const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
  Promise.resolve(Response.json({ ok: true })),
);

/** The headers the call's one request went out with. */
function sentHeaders(): Headers {
  return new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
}

afterEach(() => {
  fetchSpy.mockClear();
  vi.unstubAllGlobals();
  _resetServerCapabilitiesForTests("inProcessProxy");
  _resetSourcesForTests();
});

function apiWith(headers?: Record<string, string>) {
  return defineApi({
    name: "api",
    expose: true,
    baseURL: "https://api.test",
    ...(headers && { headers }),
    endpoints: { read: endpoint.get("items") },
  });
}

function callerWith(headers?: Record<string, string>) {
  vi.stubGlobal("fetch", fetchSpy);
  return createCaller(apiWith(headers));
}

/** A proxy client's call of `read`, sent with the headers given. */
type ProxyClient = {
  with: (options: { headers: Record<string, string> }) => { read: () => Promise<unknown> };
};

async function refusal(call: Promise<unknown>): Promise<ConfigurationError> {
  const error: unknown = await call.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(ConfigurationError);
  expect(error).toMatchObject({ code: "HEADER_VALUE_INVALID" });
  expect(String((error as Error).message)).not.toContain(SECRET);
  return error as ConfigurationError;
}

describe("a header value no request can carry", () => {
  it("is refused on a call, by the header's name and without its value", async () => {
    const error = await refusal(
      callerWith()
        .with({ headers: { "x-api-key": `${SECRET}\r\nX-Injected: 1` } })
        .read(),
    );

    expect(error.message).toContain('"x-api-key"');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is refused among the API's own headers", async () => {
    await refusal(callerWith({ "x-api-key": `${SECRET}\nX-Injected: 1` }).read());

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is refused among a caller's own headers", async () => {
    vi.stubGlobal("fetch", fetchSpy);
    const caller = createCaller(apiWith(), { headers: { "x-api-key": `${SECRET}\u0000` } });

    await refusal(caller.read());

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is refused on a proxy client's call", async () => {
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("document", {});
    const client = createProxyCaller(routesOf(apiWith(), "api")) as unknown as ProxyClient;

    await refusal(client.with({ headers: { "x-api-key": `${SECRET}\r\nX-Injected: 1` } }).read());

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is refused on a proxy client's call the proxy serves in this process", async () => {
    const api = apiWith();
    const proxy = createHandler();
    const handled = vi.spyOn(proxy, "handle");
    provideServerCapability("inProcessProxy", {
      route: (proxyPath, source) => inProcessRoute(proxyPath, source, () => proxy),
    });
    registerSources({ api });
    const client = createProxyCaller(routesOf(api, "api")) as unknown as ProxyClient;

    await refusal(client.with({ headers: { "x-api-key": `${SECRET}\nX-Injected: 1` } }).read());

    expect(handled).not.toHaveBeenCalled();
  });

  it("is refused by the standalone fetch client", async () => {
    vi.stubGlobal("fetch", fetchSpy);
    const api = createFetch({ baseURL: "https://api.test" });

    await refusal(api.get("items", { headers: { authorization: `Bearer ${SECRET}\u0000` } }));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["a no-break space", `${SECRET}\n\u00a0`],
    ["a vertical tab", `${SECRET}\n\v`],
    ["a form feed", `${SECRET}\r\n\f`],
  ])(
    "is refused with a line break before %s at its end, which trim() takes and fetch keeps",
    async (_end, value) => {
      await refusal(
        callerWith()
          .with({ headers: { "x-api-key": value } })
          .read(),
      );

      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["the first one", "\u0100"],
    ["an emoji", "\u{1f600}"],
  ])(
    "is refused holding a character past U+00FF — %s — which no header's bytes hold",
    async (_character, character) => {
      await refusal(
        callerWith()
          .with({ headers: { "x-api-key": `${SECRET}${character}` } })
          .read(),
      );

      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a start of heading", "\x01"],
    ["a vertical tab", "\x0b"],
    ["a delete", "\x7f"],
  ])(
    "is refused holding %s, which fetch's dispatcher refuses as it sends",
    async (_character, character) => {
      await refusal(
        callerWith()
          .with({ headers: { "x-api-key": `${SECRET}${character}tail` } })
          .read(),
      );

      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("is refused before fetch, so no attempt fails as a network error and none is retried", async () => {
    const upstream = await startUpstream((_req, res) => res.end("{}"));
    const onRetry = vi.fn();
    const api = defineApi({
      name: "api",
      baseURL: upstream.url,
      endpoints: {
        read: endpoint.get("items").use(retryMiddleware({ limit: 2, delay: 1, onRetry })),
      },
    });

    try {
      await refusal(
        createCaller(api)
          .with({ headers: { "x-api-key": `${SECRET}\x0b` } })
          .read(),
      );
    } finally {
      await upstream.close();
    }

    expect(onRetry).not.toHaveBeenCalled();
    expect(upstream.seen).toHaveLength(0);
  });

  it("lets through a tab, spaces inside, and a byte past 127", async () => {
    await callerWith()
      .with({ headers: { "x-note": "café\tand more" } })
      .read();

    expect(sentHeaders().get("x-note")).toBe("café\tand more");
  });

  it.each([
    ["a line break at its end", "tok\n"],
    ["a tab and a space at its ends", "\ttok "],
  ])("lets through %s, sent as fetch sends it: trimmed", async (_ends, value) => {
    await callerWith({ "x-api-key": value }).read();

    expect(sentHeaders().get("x-api-key")).toBe("tok");
  });
});
