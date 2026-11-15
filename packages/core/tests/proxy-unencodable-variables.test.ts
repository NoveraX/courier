/**
 * Through the proxy, a page cannot tell which verb an endpoint calls
 * upstream, so a file in the variables of one whose verb sends them in the
 * address — a read, a DELETE — reaches the server, which cannot carry it
 * either. The server refuses the call as the caller's to mend, as it does a
 * missing token: 400, the code a direct call throws and its message, which
 * names where the file sits; nothing goes upstream, and the server's log
 * stays quiet, as any visitor could otherwise fill it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { HTTPError } from "../src/errors";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { isUpstream } from "./helpers/is-upstream";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";

const api = defineApi({
  expose: true,
  baseURL: UPSTREAM,
  groups: {
    items: defineGroup({
      endpoints: {
        search: endpoint.get("search").variables<{ q: string; image?: unknown }>(),
        remove: endpoint.del("items/:id").variables<{ id: string; image?: unknown }>(),
      },
    }),
  },
});

interface Client {
  items: {
    search: (variables: unknown) => Promise<unknown>;
    remove: (variables: unknown) => Promise<unknown>;
  };
}

let upstreamCalls = 0;

beforeEach(() => {
  upstreamCalls = 0;
  registerSources({ api });
  const handler = createHandler();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(
      new URL(input instanceof Request ? input.url : String(input), "http://app.local"),
      init,
    );
    if (!isUpstream(request.url, UPSTREAM)) return handler.handle(request);
    upstreamCalls += 1;
    return Response.json({ ok: true });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  _resetSourcesForTests();
});

const file = () => new File(["x".repeat(10)], "f.bin");

function formWithFile(): FormData {
  const form = new FormData();
  form.append("q", "a");
  form.append("image", file());
  return form;
}

describe("a file in the variables of an endpoint whose verb sends them in the address, through the proxy", () => {
  it.each([
    ["a read's record", (client: Client) => client.items.search({ q: "a", image: file() })],
    ["a DELETE's record", (client: Client) => client.items.remove({ id: "1", image: file() })],
    ["a read's form", (client: Client) => client.items.search(formWithFile())],
  ])(
    "in %s is refused with 400 and the encoding's code, nothing sent upstream nor logged",
    async (_, call) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const client = createProxyCaller(routesOf(api, "api")) as unknown as Client;

      const failure = await call(client).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(HTTPError);
      expect(failure).toMatchObject({
        status: 400,
        data: {
          success: false,
          code: "VARIABLE_NOT_ENCODABLE",
          message: expect.stringMatching(
            /^\[courier\] variables\.image is .+an address holds text/,
          ),
        },
      });
      expect(upstreamCalls).toBe(0);
      expect(logged).not.toHaveBeenCalled();
    },
  );
});
