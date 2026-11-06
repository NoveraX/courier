/**
 * What Studio is told of the fetch a call makes: where it went, and how it
 * ended — the code an upstream answered with, even when the answer is a
 * failure, and none when no answer came at all. A call refused before it is
 * sent makes no fetch, and Studio is told of none.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import type { StudioHooks } from "../src/studio/hooks";

const { endpoint } = courier();

const HOOKS_KEY = Symbol.for("courier.studio.hooks");
const hooks = (globalThis as Record<symbol, unknown>)[HOOKS_KEY] as StudioHooks;

let server: Server | undefined;

afterEach(async () => {
  delete hooks.onRequestStart;
  delete hooks.onHttpFetchStart;
  delete hooks.onHttpFetchError;
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

function api(baseURL: string) {
  return defineApi({
    name: "api",
    baseURL,
    groups: {
      users: defineGroup({
        prefix: "users",
        endpoints: { get: endpoint.get("missing").response<unknown>() },
      }),
    },
  });
}

function watchFailures(): ReturnType<typeof vi.fn> {
  const failed = vi.fn();
  hooks.onRequestStart = () => {};
  hooks.onHttpFetchError = failed;
  return failed;
}

describe("a fetch that fails", () => {
  it("tells the code the upstream answered with", async () => {
    server = createServer((_req, res) => res.writeHead(404).end("{}"));
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const failed = watchFailures();

    await expect(
      createCaller(api(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)).users.get(),
    ).rejects.toThrow();

    expect(failed).toHaveBeenCalledOnce();
    expect(failed.mock.calls[0]?.[0]).toMatchObject({ status: 404 });
  });

  it("tells no code when no answer came", async () => {
    server = createServer();
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
    const failed = watchFailures();

    await expect(createCaller(api(`http://127.0.0.1:${port}`)).users.get()).rejects.toThrow();

    expect(failed).toHaveBeenCalledOnce();
    expect(failed.mock.calls[0]?.[0]).not.toHaveProperty("status");
  });
});

describe("a call refused before it is sent", () => {
  it.each([
    [
      "by its closure calling a verb of the other kind",
      "kinds",
      { write: true },
      "ENDPOINT_VERB_KIND",
    ],
    [
      "for variables no request carries",
      "save",
      { tags: new Set(["a"]) },
      "VARIABLE_NOT_ENCODABLE",
    ],
  ])("makes no fetch, and Studio is told of none: %s", async (_, method, variables, code) => {
    server = createServer((_req, res) => res.writeHead(200).end("{}"));
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const started = vi.fn();
    const failed = watchFailures();
    hooks.onHttpFetchStart = started;
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        endpoints: {
          kinds: endpoint
            .variables<{ write: boolean }>()
            .via((http, vars) => (vars.write === true ? http.put("x") : http.get("x")))
            .reads(),
          save: endpoint.post("save").variables<Record<string, unknown>>(),
        },
      }),
    ) as unknown as Record<string, (variables: unknown) => Promise<unknown>>;

    await expect(client[method]?.(variables)).rejects.toMatchObject({ code });

    expect(started).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });
});
