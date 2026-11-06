/**
 * The options only a server reads — the user's session, what it forwards,
 * the header lists beside a session, how an endpoint is offered to agents —
 * are checked where a server takes an API up: its sources registered, a
 * handler made with them, the server's caller made. Always, `NODE_ENV` or
 * not, since a bundler replaces it in a server's build too. A page's
 * definition carries none of the checks.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../../src/adapter/create-handler";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { defineGroup } from "../../src/define/group";
import { ConfigurationError } from "../../src/errors/configuration-error";
import { createCaller } from "../../src/server/create-caller";
import { _resetSourcesForTests, registerSources } from "../../src/server/sources";

const { endpoint } = courier();

/* An API that keeps a session, and an endpoint in a group that would carry every cookie past it. */
function accounts() {
  const users = defineGroup({ endpoints: { me: endpoint.get("me").headers(["cookie"]) } });
  return defineApi({
    name: "accounts",
    baseURL: "https://api.example.com",
    session: { cookies: ["sid"] },
    groups: { users },
  });
}

function refusalOf(takeUp: () => unknown): ConfigurationError {
  try {
    takeUp();
  } catch (error) {
    if (error instanceof ConfigurationError) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

afterEach(() => {
  _resetSourcesForTests();
  vi.unstubAllEnvs();
});

describe("the options only a server reads", () => {
  it("are not checked where the API is defined, which a page does too", () => {
    expect(accounts).not.toThrow();
  });

  it("are refused as the sources are registered, in production too, naming the endpoint", () => {
    vi.stubEnv("NODE_ENV", "production");
    const api = accounts();

    const refusal = refusalOf(() => registerSources({ accounts: api }));

    expect(refusal.code).toBe("SESSION_HEADER_CONFLICT");
    expect(refusal.message).toMatch(
      /^accounts\.users\.me: "cookie" in its headers carries cookies/,
    );
  });

  it("are refused for a cookie in the API's own header list as the sources are registered, in production too", () => {
    vi.stubEnv("NODE_ENV", "production");
    const api = defineApi({
      name: "accounts",
      baseURL: "https://api.example.com",
      session: { cookies: ["sid"] },
      allowedHeaders: ["cookie"],
      endpoints: { me: endpoint.get("me") },
    });

    const refusal = refusalOf(() => registerSources({ accounts: api }));

    expect(refusal.code).toBe("SESSION_HEADER_CONFLICT");
    expect(refusal.message).toMatch(/^accounts: "cookie" in its headers carries cookies/);
  });

  it("are refused as a handler is made with the sources", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(refusalOf(() => createHandler({ sources: { accounts: accounts() } })).code).toBe(
      "SESSION_HEADER_CONFLICT",
    );
  });

  it("are refused as the server's caller is made, before any call", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(refusalOf(() => createCaller(accounts())).code).toBe("SESSION_HEADER_CONFLICT");
  });

  it("are refused as the sources are registered for an endpoint no agent's tool can be made of", () => {
    vi.stubEnv("NODE_ENV", "production");
    const orders = defineApi({
      name: "orders",
      baseURL: "https://api.example.com",
      endpoints: { list: endpoint.get("orders").agent({ access: "read" } as never) },
    });

    const refusal = refusalOf(() => registerSources({ orders }));

    expect(refusal.code).toBe("AGENT_OPTIONS_INVALID");
    expect(refusal.message).toContain('.agent() on GET "orders" needs a description');
  });
});
