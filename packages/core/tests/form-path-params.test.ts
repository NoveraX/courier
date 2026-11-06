/**
 * Form data as an endpoint's variables, beside a path's parameters: the
 * runtime fills `:bookId` from the form's own field and sends the rest as
 * multipart, so the types take a form wherever the path names parameters —
 * alone, or as a member of a union whose other members name each parameter.
 */
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { routesOf } from "../src/define/routes-of";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { sendJson, startUpstream, type Upstream } from "./helpers/middleware-upstream";

const { endpoint } = courier();

type Cover = FormData | { bookId: string; title: string };

const books = defineGroup({
  prefix: "books",
  endpoints: {
    after: endpoint.post(":bookId/cover").variables<FormData>().response<{ url: string }>(),
    before: endpoint.variables<FormData>().post(":bookId/cover").response<{ url: string }>(),
    closure: endpoint
      .variables<FormData>()
      .via((http, form) => http.post(":bookId/cover", form))
      .response<{ url: string }>(),
    either: endpoint.post(":bookId/cover").variables<Cover>().response<{ url: string }>(),
  },
});
const api = defineApi({
  name: "api",
  baseURL: "https://api.example.com",
  expose: true,
  groups: { books },
});

let upstream: Upstream | undefined;

afterEach(async () => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  await upstream?.close();
  upstream = undefined;
});

/** A form for book b7's cover. */
function coverForm(): FormData {
  const form = new FormData();
  form.append("bookId", "b7");
  form.append("file", new Blob(["x"]), "cover.png");
  return form;
}

describe("form data variables beside a path's parameters", () => {
  it("are what a server caller takes", () => {
    const typeOnly = () => {
      const client = createCaller(api);
      expectTypeOf(client.books.after).parameter(0).toEqualTypeOf<FormData>();
      expectTypeOf(client.books.before).parameter(0).toEqualTypeOf<FormData>();
      expectTypeOf(client.books.closure).parameter(0).toEqualTypeOf<FormData>();
      expectTypeOf(client.books.either).parameter(0).toEqualTypeOf<Cover>();
    };
    expect(typeOnly).toBeTypeOf("function");
  });

  it("are what a proxy caller takes", () => {
    const typeOnly = () => {
      const client = createProxyCaller(routesOf(api, "api"));
      expectTypeOf(client.books.after).parameter(0).toEqualTypeOf<FormData>();
      expectTypeOf(client.books.before).parameter(0).toEqualTypeOf<FormData>();
      expectTypeOf(client.books.either).parameter(0).toEqualTypeOf<Cover>();
    };
    expect(typeOnly).toBeTypeOf("function");
  });

  it("may be a union, each record in it naming the path's parameters", () => {
    function typedOut(): void {
      endpoint.post(":bookId/cover").variables<FormData | { bookId: string }>();
      endpoint
        .post(":bookId/cover")
        .variables<FormData | Blob | { bookId: number; page: number }>();
      // @ts-expect-error the record in the union does not name :bookId
      endpoint.post(":bookId/cover").variables<FormData | { title: string }>();
      // @ts-expect-error neither record names :bookId
      endpoint.post(":bookId/cover").variables<{ title: string } | { page: number }>();
    }
    expect(typedOut).toBeTypeOf("function");
  });

  it("fill the path from the form's field when the call is made", async () => {
    upstream = await startUpstream((_req, res) => sendJson(res, 200, { url: "u" }));
    const client = createCaller(
      defineApi({ name: "api", baseURL: upstream.url, groups: { books } }),
    );

    await expect(client.books.after(coverForm())).resolves.toEqual({ url: "u" });
    await expect(client.books.either(coverForm())).resolves.toEqual({ url: "u" });
    expect(upstream.seen.map((request) => `${request.method} ${request.url}`)).toEqual([
      "POST /books/b7/cover",
      "POST /books/b7/cover",
    ]);
    expect(upstream.seen[0]?.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
  });

  it("fill the path from the form's field when a page calls through the proxy", async () => {
    const UPSTREAM = "https://api.example.com";
    const sent: string[] = [];
    registerSources({ api });
    const handler = createHandler();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(
        new URL(input instanceof Request ? input.url : String(input), "http://app.local"),
        init,
      );
      if (new URL(request.url).origin === UPSTREAM) {
        sent.push(`${request.method} ${new URL(request.url).pathname}`);
        return Response.json({ url: "u" });
      }
      return handler.handle(request);
    });

    await expect(createProxyCaller(routesOf(api, "api")).books.after(coverForm())).resolves.toEqual(
      { url: "u" },
    );
    expect(sent).toEqual(["POST /books/b7/cover"]);
  });
});
