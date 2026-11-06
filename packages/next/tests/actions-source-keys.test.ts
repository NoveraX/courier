/**
 * A Server Action checks the sources it is given and takes none of them
 * up: an API it names under one key may be registered under another, in
 * either order, and both go. The API keeps the key it was registered
 * under, and the server's own calls of it through the proxy in process go
 * by that key.
 */
import { createProxyCaller } from "@noverax/courier/client";
import { courier, defineApi, getSourceName } from "@noverax/courier/define";
import { routesOf } from "@noverax/courier/internal";
import { registerSources } from "@noverax/courier/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { _resetSourcesForTests } from "../../core/src/server/sources";
import { createAction } from "../src/actions";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ host: "app.example.com" })),
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), getAll: () => [] }),
}));

const { endpoint } = courier();
const sent: string[] = [];

/* An API whose name defineApi takes from its address, as one with no name of its own has it. */
function catalog(baseURL: string) {
  return defineApi({ baseURL, expose: true, endpoints: { list: endpoint.get("items") } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  sent.length = 0;
});

/* The server's own proxy caller of the API, by the key it was registered under. The built
   entries this package type-checks against carry no endpoint of the API into the routes' type. */
function proxyOf(api: object): { list(): Promise<unknown> } {
  return createProxyCaller(routesOf(api, "api")) as unknown as { list(): Promise<unknown> };
}

function upstream(): void {
  vi.stubGlobal("fetch", async (input: Request | string, init?: RequestInit) => {
    sent.push(new Request(input, init).url);
    return Response.json([]);
  });
}

describe("a Server Action beside the sources registered", () => {
  it.each(["registered first", "made first"])(
    "goes under its own key, the API %s and registered under another",
    async (order) => {
      upstream();
      const api = catalog("https://shop.example.com");
      const register = () => registerSources({ api });
      const act = () => createAction({ shop: api }, "shop");
      if (order === "registered first") {
        register();
        act();
      } else {
        act();
        register();
      }

      await createAction({ shop: api }, "shop").list();
      await proxyOf(api).list();

      expect(getSourceName(api)).toBe("api");
      expect(sent).toEqual(["https://shop.example.com/items", "https://shop.example.com/items"]);
    },
  );

  it("leaves the API the key it was registered under, though its address gives the action's", async () => {
    upstream();
    const api = catalog("https://api.example.com");
    registerSources({ api });

    createAction({ catalog: api }, "catalog");
    await proxyOf(api).list();

    expect(getSourceName(api)).toBe("api");
    expect(sent).toEqual(["https://api.example.com/items"]);
  });
});
