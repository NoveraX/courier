/**
 * Binary data inside a proxy call's variables.
 *
 * A record whose field holds a file — a Blob, an ArrayBuffer, a typed array —
 * travels as a record upload, and the server restores it, so a closure that
 * sends `v.body` upstream sends the bytes the page had. What no form carries
 * — a stream in a field, a file deeper than a field or a list's item — is
 * refused before anything is sent, naming where it sits: JSON would have
 * turned it into `{}` on the way.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { ConfigurationError } from "../src/errors/configuration-error";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { isUpstream } from "./helpers/is-upstream";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";

const api = defineApi({
  expose: true,
  baseURL: UPSTREAM,
  groups: {
    files: defineGroup({
      endpoints: {
        upload: endpoint
          .variables<{ body: unknown; name?: string }>()
          .via((http, v) => http.post("raw", {}, { body: v.body as BodyInit })),
        nested: endpoint.post("nested").variables<{ meta: { parts: unknown[] } }>(),
      },
    }),
  },
});

interface Client {
  files: {
    upload: (variables: unknown) => Promise<unknown>;
    nested: (variables: unknown) => Promise<unknown>;
  };
}

const upstreamBodies: Uint8Array[] = [];

beforeEach(() => {
  upstreamBodies.length = 0;
  registerSources({ api });
  const handler = createHandler();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(
      new URL(input instanceof Request ? input.url : String(input), "http://app.local"),
      init,
    );
    if (isUpstream(request.url, UPSTREAM)) {
      upstreamBodies.push(new Uint8Array(await request.arrayBuffer()));
      return Response.json({ ok: true });
    }
    return handler.handle(request);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
});

const bytes = new Uint8Array([0, 1, 2, 250, 251]);

describe("a proxy call carrying binary variables", () => {
  it.each([
    ["a Blob", new Blob([bytes])],
    ["an ArrayBuffer", bytes.slice().buffer],
    ["a typed array", bytes],
  ])("hands the closure the bytes when a field holds %s", async (_, body) => {
    const client = createProxyCaller(routesOf(api, "api")) as unknown as Client;

    await expect(client.files.upload({ body, name: "a" })).resolves.toEqual({ ok: true });

    expect(upstreamBodies).toEqual([bytes]);
  });

  it("is refused before anything is sent when a field holds a stream", async () => {
    const client = createProxyCaller(routesOf(api, "api")) as unknown as Client;

    const failure = await client.files
      .upload({ body: new Blob([bytes]).stream() })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConfigurationError);
    expect((failure as ConfigurationError).code).toBe("VARIABLE_NOT_ENCODABLE");
    expect((failure as Error).message).toContain("variables.body is a stream");
    expect(upstreamBodies).toHaveLength(0);
  });

  it("names where the binary value sits in a nested structure", async () => {
    const client = createProxyCaller(routesOf(api, "api")) as unknown as Client;

    const failure = await client.files
      .nested({ meta: { parts: ["a", new Blob([bytes])] } })
      .catch((error: unknown) => error);

    expect((failure as Error).message).toContain("variables.meta.parts[1]");
  });

  it("still sends variables that are plain JSON", async () => {
    const client = createProxyCaller(routesOf(api, "api")) as unknown as Client;

    await expect(client.files.upload({ body: "text", name: "a" })).resolves.toEqual({ ok: true });
    expect(new TextDecoder().decode(upstreamBodies[0])).toBe("text");
  });

  it("still sends a file inside FormData", async () => {
    const client = createProxyCaller(routesOf(api, "api")) as unknown as Client;
    const form = new FormData();
    form.set("file", new Blob([bytes]), "f.bin");

    await expect(client.files.nested(form)).resolves.toEqual({ ok: true });
    expect(upstreamBodies).toHaveLength(1);
  });
});
