/**
 * The host names and origins a handler serves, as the application's
 * deployment gives them: a list written in the config, a function read when
 * the first request comes in, or `COURIER_ALLOWED_HOSTS` and
 * `COURIER_ALLOWED_ORIGINS`.
 *
 * A function is what makes the setting work under a framework that runs the
 * route module while it builds: Next collects a page's data by evaluating it,
 * when the variables the running application has are not there yet.
 */
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createWSHandler } from "../src/adapter/handle-ws";
import type { HandlerConfig } from "../src/adapter/handler-config";
import { hostNamesOf, isHostNamed } from "../src/adapter/host-names";
import { isHostAccepted } from "../src/adapter/host-policy";
import {
  RUNTIME_SETTING_LIMITS,
  readAllowedHosts,
  readAllowedOrigins,
} from "../src/adapter/runtime-policy";
import type { WSHandlerConfig } from "../src/adapter/ws-types";
import { courier, defineApi } from "../src/define/index";
import type { WebSocketLike } from "../src/realtime/adapters";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { seededIntegers } from "./helpers/seeded-random";
import { echo, startUpstream, type Upstream } from "./helpers/upstream";

let errors: MockInstance<Console["error"]>;

beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The error lines the handler logged, as one line each. */
function loggedErrors(): string[] {
  return errors.mock.calls.map((call) => call.map(String).join(" "));
}

describe("reading allowedHosts", () => {
  it("takes a list as the config writes it, each entry checked once", () => {
    const hosts = ["app.example.com", " *.preview.example.com "];

    const reading = readAllowedHosts(hosts);

    expect(reading.ok).toBe(true);
    expect(readAllowedHosts(hosts)).toBe(reading);
    if (!reading.ok || reading.value === undefined) throw new Error("no hosts");
    expect(isHostNamed("app.example.com", reading.value)).toBe(true);
    expect(isHostNamed("pr-7.preview.example.com", reading.value)).toBe(true);
    expect(isHostNamed("preview.example.com", reading.value)).toBe(false);
  });

  it("calls a function once, when the setting is first read, not when it is given", () => {
    const names = vi.fn(() => ["app.example.com"]);
    const handler = { allowedHosts: names };

    expect(names).not.toHaveBeenCalled();
    for (let read = 0; read < 100; read += 1) readAllowedHosts(handler.allowedHosts);

    expect(names).toHaveBeenCalledTimes(1);
  });

  it("reads COURIER_ALLOWED_HOSTS when the config names none, spaces and empty entries left out", () => {
    vi.stubEnv("COURIER_ALLOWED_HOSTS", " app.example.com,, *.preview.example.com , ");

    const reading = readAllowedHosts(undefined);

    if (!reading.ok || reading.value === undefined) throw new Error("no hosts");
    expect([...reading.value.names]).toEqual(["app.example.com"]);
    expect(reading.value.suffixes).toEqual([".preview.example.com"]);
  });

  it("reads COURIER_ALLOWED_HOSTS when the function says nothing", () => {
    vi.stubEnv("COURIER_ALLOWED_HOSTS", "app.example.com");

    const reading = readAllowedHosts(() => undefined);

    if (!reading.ok || reading.value === undefined) throw new Error("no hosts");
    expect([...reading.value.names]).toEqual(["app.example.com"]);
  });

  it("takes the config over the environment, a list or a function alike", () => {
    vi.stubEnv("COURIER_ALLOWED_HOSTS", "env.example.com");

    for (const setting of [["config.example.com"], () => ["config.example.com"]]) {
      const reading = readAllowedHosts(setting);
      if (!reading.ok || reading.value === undefined) throw new Error("no hosts");
      expect([...reading.value.names]).toEqual(["config.example.com"]);
    }
  });

  it("leaves the setting unset when neither the config nor the environment sets it", () => {
    expect(readAllowedHosts(undefined)).toEqual({ ok: true, value: undefined });
    expect(readAllowedHosts(() => undefined)).toEqual({ ok: true, value: undefined });
  });

  it("follows a change of COURIER_ALLOWED_HOSTS, keeping only a few of its values", () => {
    const values = ["a.example", "b.example", "c.example", "d.example", "e.example", "a.example"];
    for (const value of values) {
      vi.stubEnv("COURIER_ALLOWED_HOSTS", value);
      const reading = readAllowedHosts(undefined);
      if (!reading.ok || reading.value === undefined) throw new Error("no hosts");
      expect([...reading.value.names]).toEqual([value]);
    }
  });

  it("reads a port in an entry as its name: a name is served on every port", () => {
    const reading = readAllowedHosts(["app.example.com:8443", "[::1]:3000"]);

    if (!reading.ok || reading.value === undefined) throw new Error("no hosts");
    expect([...reading.value.names]).toEqual(["app.example.com", "[::1]"]);
  });

  it("reads names as a request names them: in any case, and in punycode", () => {
    const reading = readAllowedHosts(["App.Example.COM", "bücher.example", "*.Example.org"]);

    if (!reading.ok || reading.value === undefined) throw new Error("no hosts");
    expect([...reading.value.names]).toEqual(["app.example.com", "xn--bcher-kva.example"]);
    expect(reading.value.suffixes).toEqual([".example.org"]);
  });

  it.each([
    ["https://app.example.com", 'has a scheme; write the host name alone: "app.example.com"'],
    ["app.example.com/admin", 'has a path; write the host name alone: "app.example.com"'],
    ["user@app.example.com", 'has a user; write the host name alone: "app.example.com"'],
    ["app example.com", "has a space in it"],
    ["", "is empty"],
    ["*", 'is not a host name; "*.example.com" serves the sub-domains of one'],
    ["*.", 'is not a host name; "*.example.com" serves the sub-domains of one'],
    ["*.*.example.com", 'is not a host name; "*.example.com" serves the sub-domains of one'],
    ["app.*.example.com", "is not a host name"],
    [`${"a".repeat(250)}.com`, "is longer than a host name can be (253 characters)"],
  ])("refuses %j: it can never be a request's host", (entry, problem) => {
    const reading = readAllowedHosts([entry]);

    expect(reading.ok).toBe(false);
    if (reading.ok) return;
    expect(reading.error.code).toBe("INVALID_ALLOWED_HOST");
    expect(reading.error.message).toBe(
      `allowedHosts, as the config gives it: the entry ${JSON.stringify(entry)} ${problem}`,
    );
  });

  it("names where a wrong entry came from", () => {
    vi.stubEnv("COURIER_ALLOWED_HOSTS", "app.example.com,https://admin.example.com");

    const fromVariable = readAllowedHosts(undefined);
    const fromFunction = readAllowedHosts(() => ["https://admin.example.com"]);

    expect(!fromVariable.ok && fromVariable.error.message).toMatch(
      /^allowedHosts, as COURIER_ALLOWED_HOSTS gives it: the entry "https:\/\/admin\.example\.com" has a scheme/,
    );
    expect(!fromFunction.ok && fromFunction.error.message).toMatch(
      /^allowedHosts, as the config's function gives it: the entry "https:\/\/admin\.example\.com"/,
    );
  });

  it("fails closed when the function throws, keeping what it threw", () => {
    const thrown = new TypeError("Invalid URL");

    const reading = readAllowedHosts(() => {
      throw thrown;
    });

    expect(reading.ok).toBe(false);
    if (reading.ok) return;
    expect(reading.error.code).toBe("RUNTIME_SETTING_FAILED");
    expect(reading.error.message).toBe(
      "allowedHosts, as the config's function gives it: the function threw TypeError: Invalid URL",
    );
    expect(reading.error.cause).toBe(thrown);
  });

  it.each([
    ["a string", "app.example.com"],
    ["a list with a number in it", ["app.example.com", 443]],
    ["an object", { hosts: [] }],
  ])("fails closed when the function returns %s", (_, returned) => {
    const reading = readAllowedHosts(() => returned as never);

    expect(reading.ok).toBe(false);
    if (reading.ok) return;
    expect(reading.error.code).toBe("RUNTIME_SETTING_FAILED");
    expect(reading.error.message).toBe(
      "allowedHosts, as the config's function gives it: the function returned something other than a list of strings or undefined",
    );
  });

  it.each([
    ["set and empty", ""],
    ["nothing but commas and spaces", " , ,"],
  ])(
    "fails closed when COURIER_ALLOWED_HOSTS is %s, rather than serving every name",
    (_, value) => {
      vi.stubEnv("COURIER_ALLOWED_HOSTS", value);

      const reading = readAllowedHosts(undefined);

      expect(reading.ok).toBe(false);
      if (reading.ok) return;
      expect(reading.error.code).toBe("RUNTIME_SETTING_FAILED");
      expect(reading.error.message).toBe(
        "allowedHosts, as COURIER_ALLOWED_HOSTS gives it: the variable is set and names no entry; unset it, or name the hosts, comma-separated",
      );
    },
  );

  it("refuses a variable longer than it reads, and a list longer than it takes", () => {
    const { MAX_VARIABLE_LENGTH, MAX_ENTRIES } = RUNTIME_SETTING_LIMITS;
    vi.stubEnv("COURIER_ALLOWED_HOSTS", "a".repeat(MAX_VARIABLE_LENGTH + 1));
    const long = readAllowedHosts(undefined);
    const many = readAllowedHosts(
      Array.from({ length: MAX_ENTRIES + 1 }, (_, at) => `h${at}.example`),
    );

    expect(!long.ok && long.error.message).toBe(
      `allowedHosts, as COURIER_ALLOWED_HOSTS gives it: the variable is longer than ${MAX_VARIABLE_LENGTH} characters`,
    );
    expect(!many.ok && many.error.message).toBe(
      `allowedHosts, as the config gives it: the list holds more than ${MAX_ENTRIES} entries`,
    );
  });

  it("logs a setting that fails once, however many requests it refuses", () => {
    const failing = () => {
      throw new Error("APP_URL is not set");
    };

    expect(readAllowedHosts(failing).ok).toBe(false);
    expect(loggedErrors()).toHaveLength(0);
    for (let read = 0; read < 50; read += 1) isHostAccepted("app.example.com", failing);

    expect(loggedErrors()).toHaveLength(1);
    expect(loggedErrors()[0]).toContain(
      "allowedHosts, as the config's function gives it: the function threw Error: APP_URL is not set",
    );
  });
});

describe("reading allowedOrigins", () => {
  it("reads COURIER_ALLOWED_ORIGINS when the config names none", () => {
    vi.stubEnv("COURIER_ALLOWED_ORIGINS", "https://app.example.com, https://*.preview.example.com");

    expect(readAllowedOrigins(undefined)).toEqual({
      ok: true,
      value: ["https://app.example.com", "https://*.preview.example.com"],
    });
  });

  it("calls a function once, and takes the config over the environment", () => {
    vi.stubEnv("COURIER_ALLOWED_ORIGINS", "https://env.example.com");
    const origins = vi.fn(() => ["https://config.example.com"]);

    readAllowedOrigins(origins);
    const reading = readAllowedOrigins(origins);

    expect(origins).toHaveBeenCalledTimes(1);
    expect(reading).toEqual({ ok: true, value: ["https://config.example.com"] });
  });

  it("refuses an origin no browser sends, as a list in the config is refused", () => {
    vi.stubEnv("COURIER_ALLOWED_ORIGINS", "https://app.example.com/");

    const reading = readAllowedOrigins(undefined);

    expect(reading.ok).toBe(false);
    if (reading.ok) return;
    expect(reading.error.code).toBe("INVALID_ALLOWED_ORIGIN");
    expect(reading.error.message).toBe(
      'allowedOrigins, as COURIER_ALLOWED_ORIGINS gives it: the entry "https://app.example.com/" can never match: a browser sends this origin as "https://app.example.com"',
    );
  });
});

describe("host entries, drawn at random", () => {
  const LABELS = ["app", "eu", "x1", "a-b", "shop", "API", "Mail", "w3", "Ünï"];
  const SPOILERS: ReadonlyArray<(name: string) => string> = [
    (name) => `https://${name}`,
    (name) => `${name}/path`,
    (name) => `user@${name}`,
    (name) => `${name}?q`,
    (name) => `${name}#f`,
    (name) => `a ${name}`,
  ];

  function nameFrom(next: (below: number) => number): string {
    return Array.from({ length: 1 + next(4) }, () => LABELS[next(LABELS.length)]).join(".");
  }

  it("serves every name they list, in whatever case a request writes it", () => {
    for (let seed = 1; seed <= 2_000; seed += 1) {
      const next = seededIntegers(seed);
      const names = Array.from({ length: 1 + next(5) }, () => nameFrom(next));
      const hosts = hostNamesOf(names);
      if ("problem" in hosts) throw new Error(`${names.join(",")}: ${hosts.problem}`);
      for (const name of names) {
        const asked = new URL(`http://${next(2) === 0 ? name.toUpperCase() : name}`).hostname;
        expect(isHostNamed(asked, hosts)).toBe(true);
      }
    }
  });

  it("refuses every entry with a scheme, a path, a user, a query, a fragment or a space", () => {
    for (let seed = 1; seed <= 2_000; seed += 1) {
      const next = seededIntegers(seed);
      const entry = SPOILERS[next(SPOILERS.length)]?.(nameFrom(next)) ?? "";

      expect(hostNamesOf([entry])).toHaveProperty("problem");
    }
  });

  it("reads a list written to COURIER_ALLOWED_HOSTS as the list it was written from", () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const next = seededIntegers(seed);
      const names = Array.from({ length: 1 + next(6) }, () => nameFrom(next).toLowerCase());
      const written = names.map((name) => `${" ".repeat(next(3))}${name}`).join(",");
      vi.stubEnv("COURIER_ALLOWED_HOSTS", written);

      const reading = readAllowedHosts(undefined);

      if (!reading.ok || reading.value === undefined) throw new Error(written);
      expect([...reading.value.names].sort()).toEqual(
        [...new Set(names.map((name) => new URL(`http://${name}`).hostname))].sort(),
      );
    }
  });
});

/** A GET for the proxy, addressed to `host`, from `origin` when one is given. */
function get(host: string, origin?: string): Request {
  return new Request(`http://${host}/api/request?_s=api&_m=me`, {
    headers: origin === undefined ? {} : { origin },
  });
}

describe("a handler created with the setting", () => {
  let upstream: Upstream;

  beforeEach(async () => {
    vi.stubEnv("NODE_ENV", "production");
    upstream = await startUpstream(echo);
    const { endpoint } = courier();
    registerSources({
      api: defineApi({
        expose: true,
        baseURL: upstream.url,
        endpoints: { me: endpoint.get("me") },
      }),
    });
  });

  afterEach(async () => {
    _resetSourcesForTests();
    await upstream.close();
  });

  it("calls its allowedHosts function once a request arrives, not when the module creating it runs", async () => {
    const names = vi.fn(() => ["app.example.com"]);
    const { handleGet } = createHandler({ allowedHosts: names });

    expect(names).not.toHaveBeenCalled();
    const served = await handleGet(get("app.example.com"));
    const refused = await handleGet(get("rebound.example"));

    expect(served.status).toBe(200);
    expect(refused.status).toBe(421);
    expect(names).toHaveBeenCalledTimes(1);
  });

  it("serves the names COURIER_ALLOWED_HOSTS lists when the config names none", async () => {
    vi.stubEnv("COURIER_ALLOWED_HOSTS", "app.example.com, *.preview.example.com");
    const { handleGet } = createHandler({});

    expect((await handleGet(get("app.example.com"))).status).toBe(200);
    expect((await handleGet(get("pr-1.preview.example.com"))).status).toBe(200);
    expect((await handleGet(get("rebound.example"))).status).toBe(421);
  });

  it("answers every entry point 500, saying nothing of why, while the setting cannot be read", async () => {
    const handler = createHandler({
      allowedHosts: () => {
        throw new Error("APP_URL is not set");
      },
    });

    const answers = await Promise.all([
      handler.handle(get("app.example.com")),
      handler.handleGet(get("app.example.com")),
      handler.handlePost(
        new Request("http://localhost/api/request?_s=api&_m=me", { method: "POST" }),
      ),
      handler.handleSSE(get("app.example.com")),
    ]);

    for (const answer of answers) {
      expect(answer.status).toBe(500);
      expect(await answer.json()).toEqual({
        success: false,
        message: "This server is misconfigured; its log says why",
        code: "SERVER_MISCONFIGURED",
      });
    }
    expect(loggedErrors()).toHaveLength(1);
    expect(upstream.received).toHaveLength(0);
  });

  it("refuses, when it is created, a list it could never match", () => {
    expect(() => createHandler({ allowedHosts: ["https://app.example.com"] })).toThrow(
      'createHandler: allowedHosts, as the config gives it: the entry "https://app.example.com" has a scheme',
    );
  });

  it("serves the pages COURIER_ALLOWED_ORIGINS lists, and lets them read the answer", async () => {
    vi.stubEnv("COURIER_ALLOWED_ORIGINS", "https://shop.example.com");
    const { handleGet } = createHandler({});

    const listed = await handleGet(get("api.example.com", "https://shop.example.com"));
    const foreign = await handleGet(get("api.example.com", "https://evil.example"));

    expect(listed.status).toBe(200);
    expect(listed.headers.get("access-control-allow-origin")).toBe("https://shop.example.com");
    expect(foreign.status).toBe(403);
  });

  it("answers a preflight from a page its allowedOrigins function lists", async () => {
    const { handle } = createHandler({ allowedOrigins: () => ["https://shop.example.com"] });

    const preflight = await handle(
      new Request("http://api.example.com/api/request?_s=api&_m=me", {
        method: "OPTIONS",
        headers: { origin: "https://shop.example.com", "access-control-request-method": "POST" },
      }),
    );

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://shop.example.com");
  });

  it("refuses a foreign page on every entry point before the rate limit counts it", async () => {
    const config: HandlerConfig = {
      allowedOrigins: () => ["https://shop.example.com"],
      rateLimit: { requests: 1, window: 60_000, key: () => "one caller" },
    };
    const { handleGet, handleSSE } = createHandler(config);

    const sse = new Request("http://api.example.com/api/request?_s=api&_m=me", {
      headers: { origin: "https://evil.example", accept: "text/event-stream" },
    });
    expect((await handleSSE(sse)).status).toBe(403);
    expect((await handleGet(get("api.example.com", "https://evil.example"))).status).toBe(403);
    expect((await handleGet(get("api.example.com"))).status).toBe(200);
  });
});

/** A socket that records how it was closed. */
function socket(): WebSocketLike & { closed: number | undefined } {
  const ws = {
    readyState: 1,
    bufferedAmount: 0,
    closed: undefined as number | undefined,
    send: () => {},
    close(code?: number) {
      ws.closed = code;
      ws.readyState = 3;
    },
    addEventListener: () => {},
  };
  return ws;
}

describe("a WebSocket handler created with the setting", () => {
  const handlers: Array<ReturnType<typeof createWSHandler>> = [];

  /* A handler whose sockets are let go once the test is over. */
  function wsHandler(config: WSHandlerConfig): ReturnType<typeof createWSHandler> {
    const handler = createWSHandler(config);
    handlers.push(handler);
    return handler;
  }

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    const { endpoint } = courier();
    registerSources({
      api: defineApi({ baseURL: "http://127.0.0.1:1", endpoints: { me: endpoint.get("me") } }),
    });
  });

  afterEach(async () => {
    await Promise.all(handlers.splice(0).map((handler) => handler.destroy()));
    _resetSourcesForTests();
  });

  it("closes a socket on a host its allowedHosts function does not name with 4421", () => {
    const { handleSocket } = wsHandler({ allowedHosts: () => ["app.example.com"] });
    const listed = socket();
    const rebound = socket();

    handleSocket(listed, new Request("http://app.example.com/ws"));
    handleSocket(rebound, new Request("http://rebound.example/ws"));

    expect(listed.closed).toBeUndefined();
    expect(rebound.closed).toBe(4421);
  });

  it("closes a socket on a host COURIER_ALLOWED_HOSTS does not name", () => {
    vi.stubEnv("COURIER_ALLOWED_HOSTS", "app.example.com");
    const { handleSocket } = wsHandler({});
    const rebound = socket();

    handleSocket(rebound, new Request("http://rebound.example/ws"));

    expect(rebound.closed).toBe(4421);
  });

  it("closes every socket, a loopback one too, while the hosts cannot be read", () => {
    vi.stubEnv("COURIER_ALLOWED_HOSTS", "https://app.example.com");
    const { handleSocket } = wsHandler({});
    const listed = socket();
    const loopback = socket();

    handleSocket(listed, new Request("http://app.example.com/ws"));
    handleSocket(loopback, new Request("http://localhost:3000/ws"));

    expect(listed.closed).toBe(4421);
    expect(loopback.closed).toBe(4421);
    expect(loggedErrors()).toHaveLength(1);
  });
});

describe("a handler whose allowedOrigins cannot be read", () => {
  it("answers every request 500, a same-origin one too", async () => {
    vi.stubEnv("COURIER_ALLOWED_ORIGINS", "https://shop.example.com/");
    const { handleGet } = createHandler({});

    const answer = await handleGet(get("localhost"));

    expect(answer.status).toBe(500);
    expect(await answer.json()).toMatchObject({ code: "SERVER_MISCONFIGURED" });
  });
});
