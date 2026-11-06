/**
 * `.safe()` calls an endpoint without throwing what a caller expects: it
 * resolves to the data, or to why the call failed — a refusal, no answer, a
 * time run out, a schema the variables or the answer failed, a token there
 * was none of. A cancellation is no failure, so it rejects as the call does,
 * and so does a mistake in how the API is described.
 */
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import {
  type CallFailure,
  HTTPError,
  isAbortError,
  isCallFailure,
  MissingTokenError,
  NetworkError,
  TimeoutError,
} from "../src/errors";
import { authMiddleware } from "../src/middleware/index";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { ValidationError } from "../src/validation";
import { sendJson, startUpstream, type Upstream } from "./helpers/middleware-upstream";

const { endpoint } = courier();
const User = z.object({ id: z.string() });

let upstream: Upstream | undefined;

afterEach(async () => {
  _resetSourcesForTests();
  await upstream?.close();
  upstream = undefined;
});

/** The API, its upstream answering each path as `answers` says. */
async function api(answers: Record<string, [status: number, body: unknown]> = {}) {
  upstream = await startUpstream((req, res) => {
    const [status, body] = answers[req.url?.split("?")[0] ?? ""] ?? [200, { id: "u1" }];
    if (status === 0) return; /* left unanswered */
    sendJson(res, status, body);
  });
  return defineApi({
    name: "api",
    baseURL: upstream.url,
    expose: true,
    timeout: 200,
    endpoints: { health: endpoint.get("health").response<{ ok: boolean }>() },
    groups: {
      users: defineGroup({
        prefix: "users",
        endpoints: {
          get: endpoint.get(":id").variables<{ id: string }>().response(User),
          slow: endpoint.get("slow"),
          checked: endpoint.post("checked").variables(z.object({ name: z.string() })),
          save: endpoint.post("save").variables<Record<string, unknown>>(),
          safe: endpoint.get("safe").response<{ named: string }>(),
          private: endpoint.get("me").use(authMiddleware({ getToken: () => null, required: true })),
          events: courier().stream.get("events").response<{ n: number }>(),
        },
      }),
    },
  });
}

describe("a direct call's .safe()", () => {
  it("resolves to the data, and no error", async () => {
    const client = createCaller(await api());

    const result = await client.users.get.safe({ id: "u1" });

    expectTypeOf(result).toEqualTypeOf<
      { data: { id: string }; error: null } | { data: null; error: CallFailure }
    >();
    expect(result).toEqual({ data: { id: "u1" }, error: null });
    if (result.error === null) expectTypeOf(result.data).toEqualTypeOf<{ id: string }>();
  });

  it.each<[string, Record<string, [number, unknown]>, string, (error: unknown) => boolean]>([
    ["a refusal", { "/users/u1": [404, { message: "no" }] }, "get", (e) => e instanceof HTTPError],
    [
      "an answer that fails its schema",
      { "/users/u1": [200, { id: 1 }] },
      "get",
      (e) => e instanceof ValidationError,
    ],
    ["a time run out", { "/users/slow": [0, null] }, "slow", (e) => e instanceof TimeoutError],
  ])("resolves to the failure for %s", async (_, answers, method, is) => {
    const client = createCaller(await api(answers)) as unknown as {
      users: Record<
        string,
        { safe: (variables: unknown) => Promise<{ data: unknown; error: unknown }> }
      >;
    };

    const result = await client.users[method]?.safe({ id: "u1" });

    expect(result?.data).toBeNull();
    expect(is(result?.error)).toBe(true);
    expect(isCallFailure(result?.error)).toBe(true);
  });

  it("resolves to the failure of variables its schema refuses, and of a token there is none of", async () => {
    const client = createCaller(await api());

    const checked = await client.users.checked.safe({ name: 1 } as unknown as { name: string });
    const missing = await client.users.private.safe();

    expect(checked.error).toBeInstanceOf(ValidationError);
    expect(missing.error).toBeInstanceOf(MissingTokenError);
  });

  it("resolves to the failure of an upstream that cannot be reached", async () => {
    const definition = await api();
    await upstream?.close();
    upstream = undefined;

    const result = await createCaller(definition).users.get.safe({ id: "u1" });

    expect(result.error).toBeInstanceOf(NetworkError);
  });

  it("rejects with the AbortError of a cancelled call, which is no failure", async () => {
    const controller = new AbortController();
    const client = createCaller(await api({ "/users/slow": [0, null] }));

    const call = client.users.with({ signal: controller.signal }).slow.safe();
    controller.abort();

    const rejected: unknown = await call.catch((error: unknown) => error);
    expect(isAbortError(rejected)).toBe(true);
  });

  it("rejects with a mistake in how the call is made, which is the program's", async () => {
    const client = createCaller(await api());

    const rejected: unknown = await client.users.save
      .safe({ tags: new Set(["a"]) })
      .catch((error: unknown) => error);

    expect(rejected).toMatchObject({ code: "VARIABLE_NOT_ENCODABLE" });
  });

  it("goes with .raw and .with(), and with an endpoint at the root", async () => {
    const client = createCaller(await api());

    const raw = await client.users.raw.get.safe({ id: "u1" });
    const withHeaders = await client.users.with({ headers: { "x-a": "1" } }).get.safe({ id: "u1" });
    const flat = await client.health.safe();

    expect(raw.data?.status).toBe(200);
    expectTypeOf(raw.data).toEqualTypeOf<{
      status: number;
      headers: Headers;
      data: { id: string };
    } | null>();
    expect(withHeaders.data).toEqual({ id: "u1" });
    expect(flat.error).toBeNull();
  });

  it("leaves an endpoint named safe within reach", async () => {
    const client = createCaller(await api({ "/users/safe": [200, { named: "safe" }] }));

    await expect(client.users.safe()).resolves.toEqual({ named: "safe" });
    expect((await client.users.safe.safe()).data).toEqual({ named: "safe" });
  });

  it("is a method of an HTTP endpoint alone: a stream's events are its failures", async () => {
    const client = createCaller(await api());
    function typedOut(): void {
      // @ts-expect-error a stream returns a subscription, which tells its failures as events
      void client.users.events.safe;
    }
    expect(typedOut).toBeTypeOf("function");
  });
});

describe("a page's .safe() through the proxy", () => {
  it("resolves to the data, and to the failure the proxy answered with", async () => {
    const definition = await api({ "/users/u2": [404, { message: "no" }] });
    registerSources({ api: definition });
    const client = createProxyCaller(routesOf(definition, "api"));

    const found = await client.users.get.safe({ id: "u1" });
    const refused = await client.users.get.safe({ id: "u2" });
    const unchecked = await client.users.checked.safe({ name: 1 } as unknown as { name: string });

    expect(found).toEqual({ data: { id: "u1" }, error: null });
    expect(refused.error).toBeInstanceOf(HTTPError);
    expect(refused.error).toMatchObject({ status: 404 });
    expect(isCallFailure(unchecked.error)).toBe(true);
  });
});
