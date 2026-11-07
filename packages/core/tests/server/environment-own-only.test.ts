/**
 * A server reads the variables of its environment as the environment's own
 * alone. Node looks a name the environment does not have up on
 * `Object.prototype`, where code elsewhere in the process may have put one;
 * found there, a variable is none, and what it configures stays as the
 * environment leaves it. The proxy refuses a write from another site's page
 * and a request for a host it does not serve, counts its limit by the address
 * that connected and hands that address on; the logger and the application's
 * address are what they are without it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../../src/adapter";
import { rememberPeerAddress } from "../../src/adapter/peer-address";
import { detectAppOrigin } from "../../src/app-origin";
import { courier, defineApi } from "../../src/define";
import { readLogFormat } from "../../src/logger/log-format";
import { readThreshold } from "../../src/logger/threshold";
import { _resetSourcesForTests, registerSources } from "../../src/server/sources";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";
const PEER = "203.0.113.7";

/* Each variable Courier reads, with what would open what it configures were it the environment's. */
const VARIABLES: Record<string, readonly string[]> = {
  COURIER_ALLOWED_ORIGINS: ["https://evil.example", "*"],
  COURIER_ALLOWED_HOSTS: ["evil.example", "*"],
  COURIER_TRUSTED_PROXIES: ["203.0.113.0/24"],
  COURIER_CLIENT_ADDRESS_HEADER: ["x-made-up-client"],
  COURIER_LOG_LEVEL: ["silent", "debug"],
  COURIER_LOG_FORMAT: ["json"],
  COURIER_APP_URL: ["https://evil.example"],
  APP_URL: ["https://evil.example"],
  COURIER_DEV_SERVER_ORIGIN: ["https://evil.example"],
  __NEXT_PRIVATE_ORIGIN: ["https://evil.example"],
  NODE_ENV: ["production"],
};

/* What the variables give together, as a deployment would set them. */
const TOGETHER: readonly Record<string, string>[] = [
  {
    COURIER_TRUSTED_PROXIES: "203.0.113.0/24",
    COURIER_CLIENT_ADDRESS_HEADER: "x-made-up-client",
  },
  { COURIER_ALLOWED_HOSTS: "*", NODE_ENV: "production" },
];

function accountsApi() {
  return defineApi({
    name: "accounts",
    baseURL: UPSTREAM,
    session: { cookies: ["sid"] },
    endpoints: {
      me: endpoint.get("me").expose(),
      rename: endpoint.post("me/name").variables<{ name: string }>().expose(),
    },
  });
}

/** A request the upstream was sent. */
interface Sent {
  url: string;
  headers: string[];
}

function upstream(sent: Sent[]): void {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = [...new Headers(init?.headers)].map(([name, value]) => `${name}: ${value}`);
    sent.push({ url, headers: headers.sort() });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      statusText: "",
      headers: { "content-type": "application/json" },
    });
  });
}

/* A browser's request of the proxy for `call`, as a page at `origin` sends it from `peer`. */
function browserRequest(
  call: "me" | "rename",
  host: string,
  headers: Record<string, string>,
): Request {
  const request = new Request(`https://${host}/api/request?_s=accounts&_m=${call}`, {
    method: call === "me" ? "GET" : "POST",
    headers: { cookie: "sid=made-up-session", ...headers },
    ...(call === "rename" && {
      body: JSON.stringify({ variables: { name: "x" } }),
    }),
  });
  rememberPeerAddress(request, PEER);
  return request;
}

async function answered(response: Response): Promise<string> {
  return `${response.status} ${await response.text()}`;
}

/** One call, as a server serves each afresh. */
type Call = () => Promise<string>;

const SCENARIOS: Record<string, () => Call> = {
  "the proxy, given a write from another site's page": () => {
    registerSources({ accounts: accountsApi() });
    const handler = createHandler();
    return async () =>
      answered(
        await handler.handle(
          browserRequest("rename", "app.localhost", {
            origin: "https://evil.example",
            "sec-fetch-site": "cross-site",
            "content-type": "application/json",
          }),
        ),
      );
  },
  "the proxy, given a read for a host it does not serve": () => {
    registerSources({ accounts: accountsApi() });
    const handler = createHandler();
    return async () =>
      answered(
        await handler.handle(
          browserRequest("me", "evil.example", {
            origin: "https://evil.example",
            "sec-fetch-site": "same-origin",
          }),
        ),
      );
  },
  "the proxy, given two reads from one address that names others": () => {
    registerSources({ accounts: accountsApi() });
    const handler = createHandler({ rateLimit: { requests: 1, window: 60_000 } });
    const read = (claimed: string) =>
      browserRequest("me", "app.localhost", {
        origin: "https://app.localhost",
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": claimed,
        "x-made-up-client": claimed,
      });
    return async () => {
      const first = await answered(await handler.handle(read("198.51.100.66")));
      return `${first} then ${await answered(await handler.handle(read("198.51.100.77")))}`;
    };
  },
  "the logger's level and format": () => async () =>
    JSON.stringify([readThreshold(), readLogFormat()]),
  "the application's address": () => async () => String(detectAppOrigin()),
};

/* The run: the variables none of the environment's own, as an environment that never set them. */
async function withoutVariables<T>(run: () => Promise<T>): Promise<T> {
  const kept = Object.keys(VARIABLES).filter((name) => Object.hasOwn(process.env, name));
  const values = kept.map((name) => [name, process.env[name]] as const);
  for (const name of kept) Reflect.deleteProperty(process.env, name);
  try {
    return await run();
  } finally {
    for (const [name, value] of values) process.env[name] = value;
  }
}

/* `Object.prototype` given each of `variables` for as long as `run` takes, as code elsewhere may. */
async function withPrototypeKeys<T>(
  variables: Record<string, string>,
  run: () => Promise<T>,
): Promise<T> {
  for (const [name, value] of Object.entries(variables)) {
    Object.defineProperty(Object.prototype, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
  }
  try {
    return await run();
  } finally {
    for (const name of Object.keys(variables)) Reflect.deleteProperty(Object.prototype, name);
  }
}

/* A call made once: what it answered, and what the upstream was sent. */
async function runOnce(call: Call, sent: Sent[]): Promise<string> {
  sent.length = 0;
  const outcome = await call().catch((error: unknown) => `failed: ${String(error)}`);
  return JSON.stringify({ outcome, sent });
}

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  expect(Object.keys(VARIABLES).filter((name) => name in {})).toEqual([]);
});

describe("a server, while Object.prototype holds a variable its environment does not have", () => {
  it.each(Object.keys(SCENARIOS))("%s, is as it is without", async (name) => {
    const ready = SCENARIOS[name];
    if (ready === undefined) throw new Error(`no scenario ${name}`);
    const sent: Sent[] = [];
    const cases = [
      ...Object.entries(VARIABLES).flatMap(([variable, values]) =>
        values.map((value) => ({ [variable]: value })),
      ),
      ...TOGETHER,
    ];
    const changed = await withoutVariables(async () => {
      upstream(sent);
      const clean = await runOnce(ready(), sent);
      expect(await runOnce(ready(), sent)).toBe(clean);
      const found: string[] = [];
      for (const variables of cases) {
        const call = ready();
        const run = await withPrototypeKeys(variables, () => runOnce(call, sent));
        if (run !== clean) found.push(`${JSON.stringify(variables)}: ${run}`);
      }
      return found;
    });

    expect(changed).toEqual([]);
  });
});
