/**
 * The caller of `@noverax/courier/server` where the core's modules are a
 * page's — a page's bundle, a test environment with the `browser`
 * condition, Jest's jsdom among them — is refused as it is made, with what
 * to do, rather than made a caller whose calls carry the page's session.
 * The root's caller is a page's there.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { courier, defineApi } from "../../src/define/index";
import { ConfigurationError } from "../../src/errors/configuration-error";

vi.mock("../../src/utils/servers-modules", () => import("../../src/browser/utils/servers-modules"));
vi.mock(
  "../../src/capabilities/missing-capability",
  () => import("../../src/browser/capabilities/missing-capability"),
);

const { endpoint } = courier();
const sent: RequestInit[] = [];

const api = defineApi({
  name: "accounts",
  baseURL: "https://app.example.test/api",
  fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(init ?? {});
    return Response.json({});
  },
  endpoints: { me: endpoint.get("me") },
});

afterEach(() => {
  sent.length = 0;
});

describe("the server entry's caller on a page's modules", () => {
  it("is refused as it is made, and nothing is sent", async () => {
    const { createCaller } = await import("../../src/server/index");

    let refused: unknown;
    try {
      createCaller(api);
    } catch (error) {
      refused = error;
    }

    expect(refused).toBeInstanceOf(ConfigurationError);
    expect((refused as ConfigurationError).code).toBe("SERVER_CAPABILITY_MISSING");
    expect(String((refused as Error).message)).toMatch(
      /^\[courier\] createCaller from @noverax\/courier\/server makes the server's caller, .* this code was built for a page, .* test it in a node environment\.$/,
    );
    expect(sent).toEqual([]);
  });

  it("leaves the root's caller to make a page's calls", async () => {
    const { createCaller } = await import("../../src/index");

    await createCaller(api).me();

    expect(sent).toHaveLength(1);
  });
});
