/**
 * An answer passes through its endpoint's stages where the call is made:
 * the response schema checks it as the upstream sent it, then each `.map()`
 * in turn, and the caller is typed with what the last one gives. An API
 * that wraps every answer in an envelope — `{ success, data }` — is
 * unwrapped there, and an envelope that says the call failed fails it with
 * an `HTTPError` that carries the envelope. Through the proxy the stages
 * run on the server, so a page gets what they gave.
 */
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { routesOf } from "../src/define/routes-of";
import { HTTPError, isHTTPError } from "../src/errors";
import { defineMiddleware, retryMiddleware } from "../src/middleware/index";
import { toOpenAPI } from "../src/openapi";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { startUpstream, type Upstream } from "./helpers/middleware-upstream";

const { endpoint } = courier();

const User = z.object({ id: z.string() });
const Envelope = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), data: User }),
  z.object({ success: z.literal(false), error: z.object({ message: z.string() }) }),
]);
type Envelope = z.infer<typeof Envelope>;
const refused = { success: false, error: { message: "no such user" } };

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
  _resetSourcesForTests();
});

/** An upstream that answers every request with `body`, and `headers` beside it. */
async function answering(body: unknown, headers: Record<string, string> = {}): Promise<string> {
  upstream = await startUpstream((_req, res) => {
    res.writeHead(200, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  });
  return upstream.url;
}

/* The recipe the docs give: check the envelope, hand on its data, or fail the call with it. */
function unwrap(envelope: Envelope, answer: { status: number; headers: Headers }) {
  if (envelope.success) return envelope.data;
  throw new HTTPError({ ...answer, data: envelope }, { message: envelope.error.message });
}

describe(".map()", () => {
  it("maps the answer, typed as what the caller gets", async () => {
    const url = await answering({ success: true, data: { id: "u1" } });
    const me = endpoint
      .get("me")
      .response<{ success: boolean; data: { id: string } }>()
      .map((envelope) => envelope.data);
    const client = createCaller(defineApi({ name: "api", baseURL: url, endpoints: { me } }));

    expectTypeOf(client.me).returns.resolves.toEqualTypeOf<{ id: string }>();
    await expect(client.me()).resolves.toEqual({ id: "u1" });
  });

  it("maps what the schema checked, the upstream's answer as it came", async () => {
    const url = await answering({ success: true, data: { id: "u1", extra: true } });
    const seen: unknown[] = [];
    const me = endpoint
      .get("me")
      .response(Envelope)
      .map((envelope) => {
        seen.push(envelope);
        return unwrap(envelope, { status: 200, headers: new Headers() });
      });
    const client = createCaller(defineApi({ name: "api", baseURL: url, endpoints: { me } }));

    expectTypeOf(client.me).returns.resolves.toEqualTypeOf<{ id: string }>();
    await expect(client.me()).resolves.toEqual({ id: "u1" });
    expect(seen).toEqual([{ success: true, data: { id: "u1" } }]);
  });

  it("runs each stage in turn, an asynchronous one too, typed as the last gives", async () => {
    const url = await answering([3, 1, 2]);
    const sorted = endpoint
      .get("numbers")
      .response<number[]>()
      .map((numbers) => [...numbers].sort((a, b) => a - b))
      .map(async (numbers) => numbers.join(","));
    const client = createCaller(defineApi({ name: "api", baseURL: url, endpoints: { sorted } }));

    expectTypeOf(client.sorted).returns.resolves.toEqualTypeOf<string>();
    await expect(client.sorted()).resolves.toBe("1,2,3");
  });

  it("hands a stage the answer's status and headers", async () => {
    const url = await answering([{ id: "u1" }], { "x-total-count": "42" });
    const page = endpoint
      .get("users")
      .response<Array<{ id: string }>>()
      .map((users, answer) => ({
        users,
        total: Number(answer.headers.get("x-total-count")),
        status: answer.status,
      }));
    const client = createCaller(defineApi({ name: "api", baseURL: url, endpoints: { page } }));

    await expect(client.page()).resolves.toEqual({ users: [{ id: "u1" }], total: 42, status: 200 });
  });

  it("keeps the answer's status and headers beside the mapped data for .raw", async () => {
    const url = await answering([{ id: "u1" }], { "x-total-count": "1" });
    const count = endpoint
      .get("users")
      .response<Array<{ id: string }>>()
      .map((users) => users.length);
    const client = createCaller(defineApi({ name: "api", baseURL: url, endpoints: { count } }));

    const answer = await client.raw.count();

    expectTypeOf(answer.data).toEqualTypeOf<number>();
    expect(answer).toMatchObject({ status: 200, data: 1 });
    expect(answer.headers.get("x-total-count")).toBe("1");
  });

  it("is passed what an after middleware sees, which is what the stages gave", async () => {
    const url = await answering({ success: true, data: { id: "u1" } });
    const seen: unknown[] = [];
    const watch = defineMiddleware("watch", "after", (_ctx, response) => {
      seen.push(response.data);
      return response;
    });
    const me = endpoint.get("me").response(Envelope).map(unwrap).use(watch);
    const client = createCaller(defineApi({ name: "api", baseURL: url, endpoints: { me } }));

    await client.me();

    expect(seen).toEqual([{ id: "u1" }]);
  });

  it("leaves a streamed answer to its reader", async () => {
    const url = await answering([1, 2]);
    const numbers = endpoint
      .get("numbers")
      .response<number[]>()
      .map((list) => list.length);
    const client = createCaller(defineApi({ name: "api", baseURL: url, endpoints: { numbers } }));

    const stream = await client.with({ stream: true }).numbers();

    expect(stream).toBeInstanceOf(ReadableStream);
    await expect(new Response(stream).json()).resolves.toEqual([1, 2]);
  });

  it("names its answer before .map(): a schema named after it would check what no stage gave", () => {
    function typedOut(): void {
      endpoint
        .get("me")
        .map((answer) => String(answer))
        // @ts-expect-error .response() describes the answer before .map()
        .response(User);
      endpoint
        .get("me")
        .map((answer) => String(answer))
        .timeout(1_000)
        // @ts-expect-error a stage named before keeps .response() out of reach
        .response<{ id: string }>();
    }
    expect(typedOut).toBeTypeOf("function");
  });
});

describe("an envelope that says its call failed", () => {
  it("fails the call with an HTTPError that carries the envelope, sent once", async () => {
    const url = await answering(refused);
    const me = endpoint.get("me").response(Envelope).map(unwrap);
    const client = createCaller(
      defineApi({
        name: "api",
        baseURL: url,
        middleware: [retryMiddleware({ limit: 2, delay: 1 })],
        endpoints: { me },
      }),
    );

    const error = await client.me().catch((thrown: unknown) => thrown);

    expect(isHTTPError(error)).toBe(true);
    expect(error).toMatchObject({ status: 200, data: refused, message: "no such user" });
    expect(upstream?.seen).toHaveLength(1);
  });
});

describe("through the proxy", () => {
  async function proxyClient(body: unknown) {
    const url = await answering(body);
    const api = defineApi({
      expose: true,
      name: "api",
      baseURL: url,
      endpoints: { me: endpoint.get("me").response(Envelope).map(unwrap) },
    });
    registerSources({ api });
    return createProxyCaller(routesOf(api, "api"));
  }

  it("runs the stages on the server, so a page gets what they gave", async () => {
    const client = await proxyClient({ success: true, data: { id: "u1" } });

    await expect(client.me()).resolves.toEqual({ id: "u1" });
  });

  it("answers a page an envelope that failed with 502, the envelope beside it", async () => {
    const client = await proxyClient(refused);

    const error = await client.me().catch((thrown: unknown) => thrown);

    expect(error).toMatchObject({ status: 502, data: refused });
  });
});

describe("what a definition describes", () => {
  it("describes the upstream's answer, which the schema checks before any stage", () => {
    const api = defineApi({
      name: "api",
      baseURL: "https://api.example.com",
      endpoints: { me: endpoint.get("me").response(Envelope).map(unwrap) },
    });

    const answer = toOpenAPI(api).paths["/me"]?.get?.responses?.["200"];

    expect(JSON.stringify(answer)).toContain('"success"');
  });
});
