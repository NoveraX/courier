/**
 * A path parameter stays inside its own segment.
 *
 * Encoding a value does not help with `.` and `..`: the URL parser treats
 * them — and their percent-encoded forms — as dot segments and removes them
 * together with the segment before. `{ id: ".." }` on `p/:id/tail` sent the
 * request to `/tail`, a route the endpoint never declared, with the server's
 * credentials when it came through the proxy.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { HTTPError } from "../src/errors";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { echo, startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream(echo);
});

afterEach(async () => {
  _resetSourcesForTests();
  await upstream.close();
});

function api() {
  return defineApi({
    expose: true,
    name: "paths",
    baseURL: `${upstream.url}/echo`,
    endpoints: { tail: endpoint.get("p/:id/tail").variables<{ id: string }>() },
  });
}

describe("a dot segment as a path parameter", () => {
  it.each([".", ".."])("refuses %j before any request is sent", async (id) => {
    const error = await createCaller(api())
      .tail({ id })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HTTPError);
    expect((error as HTTPError).status).toBe(400);
    expect(upstream.received).toEqual([]);
  });

  it("is refused when it arrives through the proxy", async () => {
    registerSources({ paths: api() });
    const request = new Request("http://app.localhost/api/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "paths", method: "tail", variables: { id: ".." } }),
    });

    const response = await createHandler().handlePost(request);

    expect(response.status).toBe(400);
    expect(upstream.received).toEqual([]);
  });
});

describe("a value that only contains dots", () => {
  it.each(["...", "a..b", ".hidden"])("reaches its own segment as %j", async (id) => {
    await createCaller(api()).tail({ id });

    expect(upstream.received.map((r) => r.url)).toEqual([`/echo/p/${id}/tail`]);
  });

  it("keeps a slash inside the segment", async () => {
    await createCaller(api()).tail({ id: "../admin" });

    expect(upstream.received.map((r) => r.url)).toEqual(["/echo/p/..%2Fadmin/tail"]);
  });
});

describe("a path parameter with no value", () => {
  it("is refused with an error that names it and where it comes from", async () => {
    const error = await createCaller(api())
      .tail({} as { id: string })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HTTPError);
    expect((error as HTTPError).status).toBe(400);
    expect((error as HTTPError).message).toBe(
      'Missing required path parameter "id": pass it in the variables, or return it from pathOptions',
    );
    expect((error as HTTPError).data).toMatchObject({ message: (error as HTTPError).message });
    expect(upstream.received).toEqual([]);
  });

  it("is refused through the proxy with the same words", async () => {
    registerSources({ paths: api() });
    const request = new Request("http://app.localhost/api/request?_s=paths&_m=tail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variables: {} }),
    });

    const response = await createHandler().handlePost(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message:
        'Missing required path parameter "id": pass it in the variables, or return it from pathOptions',
    });
    expect(upstream.received).toEqual([]);
  });
});

describe("a parameter written {+name}", () => {
  function slashes() {
    return defineApi({
      expose: true,
      name: "slashes",
      baseURL: `${upstream.url}/echo`,
      endpoints: {
        operation: endpoint.get("v1/{+name}").variables<{ name: string }>(),
        cancel: endpoint.post("v1/{+name}::cancel").variables<{ name: string }>(),
      },
    });
  }

  it("sends its value's slashes as written, each part encoded", async () => {
    await createCaller(slashes()).operation({ name: "projects/p 1/operations/o" });
    await createCaller(slashes()).cancel({ name: "projects/p/operations/o" });

    expect(upstream.received.map((r) => r.url)).toEqual([
      "/echo/v1/projects/p%201/operations/o",
      "/echo/v1/projects/p/operations/o:cancel",
    ]);
  });

  it.each(["projects/../admin", "projects//o", "./o", "projects/p/"])(
    "refuses %j, a part of which would change the route, before any request is sent",
    async (name) => {
      const error = await createCaller(slashes())
        .operation({ name })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HTTPError);
      expect((error as HTTPError).status).toBe(400);
      expect((error as HTTPError).message).toMatch(
        /^Path parameter name cannot be ".*": its part ".*" would change the route$/,
      );
      expect(upstream.received).toEqual([]);
    },
  );
});

describe("a parameter written {name}", () => {
  it("ends where its brace does, the text after it sent as written", async () => {
    const files = defineApi({
      expose: true,
      name: "files",
      baseURL: `${upstream.url}/echo`,
      endpoints: { suffixed: endpoint.get("files/{id}abc").variables<{ id: string }>() },
    });

    await createCaller(files).suffixed({ id: "7/8" });

    expect(upstream.received.map((r) => r.url)).toEqual(["/echo/files/7%2F8abc"]);
  });
});
