/**
 * Binary data inside a proxy call's variables.
 *
 * The proxy envelope is JSON, and JSON has no binary type: a Blob, an
 * ArrayBuffer or a stream becomes `{}` on the way. A closure that sent
 * `v.body` upstream then sent the text `[object Object]`, and the call
 * resolved as if the bytes had arrived.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { ConfigurationError } from "../src/errors/configuration-error";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";

const api = defineApi({
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
    if (request.url.startsWith(UPSTREAM)) {
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
    ["a stream", new Blob([bytes]).stream()],
  ])("is refused before anything is sent when it holds %s", async (_, body) => {
    const client = createProxyCaller("api") as unknown as Client;

    const failure = await client.files.upload({ body }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConfigurationError);
    expect((failure as ConfigurationError).code).toBe("PROXY_VARIABLE_NOT_SERIALIZABLE");
    expect((failure as Error).message).toContain("variables.body");
    expect(upstreamBodies).toHaveLength(0);
  });

  it("names where the binary value sits in a nested structure", async () => {
    const client = createProxyCaller("api") as unknown as Client;

    const failure = await client.files
      .nested({ meta: { parts: ["a", new Blob([bytes])] } })
      .catch((error: unknown) => error);

    expect((failure as Error).message).toContain("variables.meta.parts[1]");
  });

  it("still sends variables that are plain JSON", async () => {
    const client = createProxyCaller("api") as unknown as Client;

    await expect(client.files.upload({ body: "text", name: "a" })).resolves.toEqual({ ok: true });
    expect(new TextDecoder().decode(upstreamBodies[0])).toBe("text");
  });

  it("still sends a file inside FormData", async () => {
    const client = createProxyCaller("api") as unknown as Client;
    const form = new FormData();
    form.set("file", new Blob([bytes]), "f.bin");

    await expect(client.files.nested(form)).resolves.toEqual({ ok: true });
    expect(upstreamBodies).toHaveLength(1);
  });
});
