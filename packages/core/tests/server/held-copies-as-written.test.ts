/**
 * What a server holds in place of the options it checked is the data their
 * user wrote, as it was written — the objects and the lists — frozen. Code
 * that reads the options back after the server took the API up, to log
 * them or hand them to a library that takes plain objects, reads what it
 * read before: what the server reads of them, its own fields alone, is its
 * own concern.
 */
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";

import { courier, defineApi } from "../../src/define";
import { createCaller } from "../../src/server/create-caller";

const { endpoint } = courier();

function accountsApi() {
  return defineApi({
    name: "accounts",
    baseURL: "https://api.example.com",
    session: { cookies: ["sid"], csrf: { cookie: "csrf", header: "x-csrf" } },
    forward: { requestId: true, headers: ["x-tenant"] },
    allowedHeaders: ["x-api-version"],
    endpoints: {
      me: endpoint
        .get("me")
        .headers(["x-total-count"])
        .agent({ description: "The signed-in user", access: "read" }),
    },
  });
}

/* Each option a server holds in place, from the API. */
function held(api: ReturnType<typeof accountsApi>) {
  const options = api.options as Record<string, Record<string, unknown>>;
  const endpointOptions = (api.me as unknown as { options: Record<string, unknown> }).options;
  return {
    session: options.session,
    "session.csrf": options.session?.csrf,
    "session.cookies": options.session?.cookies,
    forward: options.forward,
    allowedHeaders: options.allowedHeaders,
    "the endpoint's header list": endpointOptions.allowedHeaders,
    "the endpoint's .agent()": endpointOptions.agent,
  };
}

/* What code that reads options back does with one. */
const READS: Record<string, (value: unknown) => unknown> = {
  "String()": (value) => String(value),
  "a template string": (value) => `${value as string}`,
  "hasOwnProperty()": (value) =>
    Object.hasOwn(value as { hasOwnProperty(key: string): boolean }, "length") ||
    Object.hasOwn(value as { hasOwnProperty(key: string): boolean }, "cookies"),
  "instanceof Object": (value) => value instanceof Object,
  "its constructor": (value) => (value as { constructor?: unknown }).constructor,
  "its prototype": (value) => Object.getPrototypeOf(value),
  "inspect()": (value) => inspect(value),
  "JSON.stringify()": (value) => JSON.stringify(value),
  "a spread": (value) => (Array.isArray(value) ? [...value] : { ...(value as object) }),
};

/* What every read gives for each option, or how it fails. */
function readsOf(options: Record<string, unknown>): Record<string, unknown> {
  const seen: Record<string, unknown> = {};
  for (const [option, value] of Object.entries(options)) {
    for (const [read, how] of Object.entries(READS)) {
      try {
        seen[`${option}: ${read}`] = how(value);
      } catch (error) {
        seen[`${option}: ${read}`] = `throws ${String(error)}`;
      }
    }
  }
  return seen;
}

describe("the options a server holds in place, as code reads them back", () => {
  it("read as they did before the server took the API up, only frozen", () => {
    const api = accountsApi();
    const before = readsOf(held(api));

    createCaller(api);
    const after = held(api);

    expect(readsOf(after)).toEqual(before);
    expect(Object.values(after).every((value) => Object.isFrozen(value))).toBe(true);
  });
});
