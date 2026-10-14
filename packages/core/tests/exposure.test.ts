/**
 * Which endpoints a browser may reach by name.
 *
 * The proxy addresses endpoints by name and resolves them in the registry the
 * application declared, so without a gate a page could reach an endpoint
 * written for a cron job — with the server's credentials — by guessing its
 * name, such as `_g=admin&_m=exportPayouts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isExposedToWire } from "../src/adapter/exposure";
import { courier, defineApi, defineGroup } from "../src/define/index";
import type { Context } from "../src/http-client/types";
import { executeRequest } from "../src/utils/execute";
import { ENDPOINT_SCHEMA, type SchemaMetadata } from "../src/validation";

const { endpoint, stream, channel } = courier();

const fetchSpy = vi.fn();

/** A config with one group for the browser and one only the server should call. */
function apiWith(options: { source?: boolean; publicGroup?: boolean; adminGroup?: boolean }) {
  return defineApi({
    baseURL: "https://internal-api.corp.example",
    ...(options.source === undefined ? {} : { expose: options.source }),
    groups: {
      posts: defineGroup({
        prefix: "posts",
        ...(options.publicGroup === undefined ? {} : { expose: options.publicGroup }),
        endpoints: { list: endpoint.get("").response<unknown>() },
      }),
      admin: defineGroup({
        prefix: "admin",
        ...(options.adminGroup === undefined ? {} : { expose: options.adminGroup }),
        endpoints: { exportPayouts: endpoint.get("payouts/export").response<unknown>() },
      }),
    },
  });
}

/** A request shaped exactly as the browser's proxy client sends it. */
async function fromBrowser(api: unknown, group: string, method: string) {
  const response = (await executeRequest(
    { api } as never,
    { source: "api", group, method } as never,
    {
      res: new Response(),
      proxyMethod: "GET",
      req: new Request("https://app.example.com/api/request"),
    } as Context & { res: Response },
  )) as Response;

  return { status: response.status, body: await response.text() };
}

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue(
    new Response(JSON.stringify({ secret: "payout data" }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isExposedToWire", () => {
  it("keeps from a page what nothing marks for it, and anything that is not a source", () => {
    expect(isExposedToWire({ options: {} }, undefined)).toBe(false);
    expect(isExposedToWire({ options: {} }, "admin", "purge")).toBe(false);
    expect(isExposedToWire(undefined, undefined)).toBe(false);
  });

  it("honours the source's own answer", () => {
    expect(isExposedToWire({ options: { expose: false } }, undefined)).toBe(false);
  });

  it("lets a group overrule the source in both directions", () => {
    const closed = { options: { expose: false, groups: { open: { options: { expose: true } } } } };
    const open = { options: { expose: true, groups: { shut: { options: { expose: false } } } } };

    expect(isExposedToWire(closed, "open")).toBe(true);
    expect(isExposedToWire(closed, "other")).toBe(false);
    expect(isExposedToWire(open, "shut")).toBe(false);
    expect(isExposedToWire(open, "other")).toBe(true);
  });
});

describe("isExposedToWire on a config written without types", () => {
  it("shuts off what a flag set to anything but true is set on", () => {
    expect(isExposedToWire({ options: { expose: "false" } }, undefined)).toBe(false);
    expect(isExposedToWire({ options: { expose: 0 } }, undefined)).toBe(false);
    const groups = { admin: { options: { expose: "no" } } };
    expect(isExposedToWire({ options: { groups } }, "admin")).toBe(false);
  });

  it("reads a group only by its own name, whatever the request names", () => {
    const closed = { options: { expose: false, groups: {} } };

    expect(isExposedToWire(closed, "constructor")).toBe(false);
    expect(isExposedToWire(closed, "__proto__")).toBe(false);
  });
});

describe("the proxy refuses what was not exposed", () => {
  it("serves a group the config opened", async () => {
    const { status } = await fromBrowser(
      apiWith({ source: false, publicGroup: true }),
      "posts",
      "list",
    );

    expect(status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses the admin group a caller guessed the name of", async () => {
    const api = apiWith({ source: false, publicGroup: true });

    const { body } = await fromBrowser(api, "admin", "exportPayouts");

    expect(body).toContain("method not found");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /**
   * A refusal that says "forbidden" confirms the name exists, which is the one
   * thing a caller guessing names is trying to learn.
   */
  it("answers a closed endpoint exactly as it answers an invented one", async () => {
    const api = apiWith({ source: false, publicGroup: true });

    const refused = await fromBrowser(api, "admin", "exportPayouts");
    const invented = await fromBrowser(api, "admin", "noSuchMethodAnywhere");

    /* Both echo the name the caller sent, so the only thing to compare is
       what the answer says about it. */
    const shapeOf = (body: string, method: string) => body.replace(method, "<name>");

    expect(refused.status).toBe(invented.status);
    expect(shapeOf(refused.body, "exportPayouts")).toBe(
      shapeOf(invented.body, "noSuchMethodAnywhere"),
    );
    expect(refused.body).not.toMatch(/forbidden|not allowed|exposed/i);
  });

  it("closes a single group while the rest of the source stays open", async () => {
    const api = apiWith({ source: true, adminGroup: false });

    expect((await fromBrowser(api, "posts", "list")).status).toBe(200);
    fetchSpy.mockClear();
    expect((await fromBrowser(api, "admin", "exportPayouts")).body).toContain("method not found");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses every endpoint of a source that marks nothing, as an unknown name", async () => {
    const { status, body } = await fromBrowser(apiWith({}), "posts", "list");

    expect(status).toBe(400);
    expect(body).toContain("method not found");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/* The metadata the proxy reads off an endpoint: its `.expose()` among the rest. */
function schemaOf(declared: unknown): SchemaMetadata | undefined {
  return (declared as { [ENDPOINT_SCHEMA]?: SchemaMetadata })[ENDPOINT_SCHEMA];
}

describe("an endpoint's own mark", () => {
  it("is carried where the proxy reads it, on HTTP endpoints, streams and channels", () => {
    expect(schemaOf(endpoint.get("search").expose())?.expose).toBe(true);
    expect(schemaOf(endpoint.post("payouts").expose(false))?.expose).toBe(false);
    expect(schemaOf(stream.get("feed").response<string>().expose())?.expose).toBe(true);
    expect(schemaOf(channel.connect("room").response<string>().expose())?.expose).toBe(true);
    expect(schemaOf(endpoint.get("plain"))?.expose).toBeUndefined();
  });

  it("is carried by a stream served in this process, named before it is implemented", () => {
    const served = stream
      .response<number>()
      .expose()
      .implement(async function* () {
        yield { data: 1 };
      });

    expect(schemaOf(served)?.expose).toBe(true);
  });

  it("keeps a mark passed anything but true shut, as the flags do", () => {
    expect(schemaOf(endpoint.get("search").expose("yes" as never))?.expose).toBe(false);
  });

  it("decides before its group and its API, in both directions", () => {
    const closed = {
      options: { expose: false, groups: { posts: { options: { expose: false } } } },
    };
    const open = { options: { expose: true, groups: { posts: { options: { expose: true } } } } };

    expect(isExposedToWire(closed, "posts", "list", { expose: true })).toBe(true);
    expect(isExposedToWire(open, "posts", "list", { expose: false })).toBe(false);
    expect(isExposedToWire(closed, "posts", "list", {})).toBe(false);
    expect(isExposedToWire(open, "posts", "list", {})).toBe(true);
  });

  it("opens one endpoint of an API the browser may not otherwise call", async () => {
    const api = defineApi({
      baseURL: "https://internal-api.corp.example",
      expose: false,
      groups: {
        posts: defineGroup({
          prefix: "posts",
          endpoints: {
            list: endpoint.get("").response<unknown>().expose(),
            drafts: endpoint.get("drafts").response<unknown>(),
          },
        }),
      },
    });

    expect((await fromBrowser(api, "posts", "list")).status).toBe(200);
    fetchSpy.mockClear();
    expect((await fromBrowser(api, "posts", "drafts")).body).toContain("method not found");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/**
 * A server-side caller is not addressing anything by name off the wire — it
 * holds the source object and already decided what to call.
 */
describe("a server-side caller is not gated", () => {
  it("reaches a closed group from in-process code", async () => {
    const api = apiWith({ source: false });

    await executeRequest(
      { api } as never,
      {
        source: "api",
        group: "admin",
        method: "exportPayouts",
      } as never,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
