/**
 * A closure that works its variables into its path writes them with
 * `http.path`: each value is text the request sends as it is, encoded, so
 * that none is read as a parameter, a colon, a query or a fragment — the
 * path a closure wrote with plain interpolation read `report:draft` as a
 * parameter named draft, and sent another variable in its place. While
 * the endpoint is probed, each value stays the parameter it stands for.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { pathWriter, probingPath } from "../src/define/path-tag";
import { type HttpWire, probeWire } from "../src/define/probe";
import { HTTPError } from "../src/errors";
import { RealtimeValidationError } from "../src/realtime/errors";
import { addressCall } from "../src/transport/direct/address";
import { echo, startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream(echo);
});

afterEach(async () => {
  await upstream.close();
});

function files() {
  return defineApi({
    name: "files",
    baseURL: `${upstream.url}/echo`,
    endpoints: {
      interpolated: endpoint
        .variables<{ name: string; draft?: string }>()
        .via((http, { name }) => http.get(`files/${name}`, undefined)),
      written: endpoint
        .variables<{ name: string; draft?: string }>()
        .via((http, { name }) => http.get(http.path`files/${name}`, undefined)),
      report: endpoint
        .variables<{ year: number; month: number }>()
        .via((http, { year, month }) =>
          http.get(http.path`reports/${year}-${month}/summary`, undefined),
        ),
      suffixed: endpoint
        .variables<{ id: string }>()
        .via((http, { id }) => http.get(http.path`files/${id}abc`, undefined)),
      dotted: endpoint
        .variables<{ name: string; ext: string }>()
        .via((http, { name, ext }) => http.get(http.path`reports/${name}.${ext}`, undefined)),
      dotFirst: endpoint
        .variables<{ name: string }>()
        .via((http, { name }) => http.get(http.path`files/.${name}`, undefined)),
      encodedDot: endpoint
        .variables<{ name: string }>()
        .via((http, { name }) => http.get(http.path`files/%2E${name}`, undefined)),
      adjacent: endpoint
        .variables<{ a: string; b: string }>()
        .via((http, { a, b }) => http.get(http.path`files/${a}${b}`, undefined)),
      tagged: endpoint
        .variables<{ tag: string }>()
        .via((http, { tag }) => http.get(http.path`files?tag=${tag}`, undefined)),
      user: endpoint
        .variables<{ id?: string | null | undefined }>()
        .via((http, { id }) => http.get(http.path`users/${id}`, undefined)),
    },
  });
}

describe("a value a closure puts into its path with http.path", () => {
  it.each([
    ["report:draft", "/echo/files/report%3Adraft"],
    ["a::b", "/echo/files/a%3A%3Ab"],
    ["a?b#c", "/echo/files/a%3Fb%23c"],
    ["{id}/x", "/echo/files/%7Bid%7D%2Fx"],
  ])("is sent as text, %j encoded", async (name, sent) => {
    await createCaller(files()).written({ name, draft: "x" });

    expect(upstream.received.map((r) => r.url)).toEqual([sent]);
  });

  it("fills a path written around several values in one segment", async () => {
    await createCaller(files()).report({ year: 2026, month: 10 });

    expect(upstream.received.map((r) => r.url)).toEqual(["/echo/reports/2026-10/summary"]);
  });

  it.each(["..", ".", ""])(
    "refuses %j where it is a segment whole, before any request is sent",
    async (name) => {
      const error = await createCaller(files())
        .written({ name })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HTTPError);
      expect((error as HTTPError).status).toBe(400);
      expect((error as HTTPError).message).toBe(
        `A value put into the path makes its segment "${name}", which would change the route`,
      );
      expect(upstream.received).toEqual([]);
    },
  );

  it("refuses values that make their segment empty, . or .. with the text beside them", async () => {
    const client = createCaller(files());

    const refusals = [
      await client.dotted({ name: "", ext: "." }).catch((e: unknown) => e),
      await client.dotted({ name: ".", ext: "" }).catch((e: unknown) => e),
      await client.dotFirst({ name: "." }).catch((e: unknown) => e),
      await client.encodedDot({ name: "." }).catch((e: unknown) => e),
      await client.adjacent({ a: "", b: "" }).catch((e: unknown) => e),
    ];

    expect(refusals.map((error) => error instanceof HTTPError && error.status)).toEqual([
      400, 400, 400, 400, 400,
    ]);
    expect(refusals.map((error) => (error as HTTPError).message)).toEqual([
      'A value put into the path makes its segment "..", which would change the route',
      'A value put into the path makes its segment "..", which would change the route',
      'A value put into the path makes its segment "..", which would change the route',
      'A value put into the path makes its segment "%2E.", which would change the route',
      'A value put into the path makes its segment "", which would change the route',
    ]);
    expect(upstream.received).toEqual([]);
  });

  it("is taken whatever it holds where its segment names its own route", async () => {
    const client = createCaller(files());

    await client.suffixed({ id: ".." });
    await client.adjacent({ a: "", b: "x" });
    await client.dotted({ name: "q3", ext: "" });
    await client.tagged({ tag: "." });

    expect(upstream.received.map((r) => r.url)).toEqual([
      "/echo/files/..abc",
      "/echo/files/x",
      "/echo/reports/q3.",
      "/echo/files?tag=.",
    ]);
  });

  it.each([undefined, null])(
    "refuses %s, which would be sent as text, before any request is sent",
    async (id) => {
      const error = await createCaller(files())
        .user({ id })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HTTPError);
      expect((error as HTTPError).status).toBe(400);
      expect((error as HTTPError).message).toBe(
        `Missing a value put into the path: it is ${id}, which would be sent as the text "${id}"`,
      );
      expect(upstream.received).toEqual([]);
    },
  );

  it("refuses a value no URL can hold as a parameter's is, before any request is sent", async () => {
    const error = await createCaller(files())
      .user({ id: `a${String.fromCharCode(0xd800)}` })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HTTPError);
    expect((error as HTTPError).status).toBe(400);
    expect((error as HTTPError).message).toMatch(/^A value put into the path cannot be encoded: /);
    expect(upstream.received).toEqual([]);
  });
});

describe("a value a closure interpolates into its path itself", () => {
  it("is read as the path's own text, as it always was", async () => {
    await createCaller(files()).interpolated({ name: "report:draft", draft: "x" });

    expect(upstream.received.map((r) => r.url)).toEqual(["/echo/files/reportx"]);
  });
});

describe("a closure's path while the endpoint is probed", () => {
  it("records each value as the parameter it stands for, braced where text follows it", () => {
    expect(
      probeWire((http: HttpWire, vars: { year: number; month: number }) =>
        http.get(http.path`reports/${vars.year}-${vars.month}/summary`),
      ).path,
    ).toBe("reports/:year-:month/summary");
    expect(
      probeWire((http: HttpWire, vars: { id: string }) => http.get(http.path`files/${vars.id}abc`))
        .path,
    ).toBe("files/{id}abc");
  });

  it("takes a value that would change the route, which a call then refuses", async () => {
    const api = defineApi({
      name: "fixed",
      baseURL: `${upstream.url}/echo`,
      endpoints: { up: endpoint.via((http) => http.get(http.path`files/${".."}`, undefined)) },
    });

    const error = await createCaller(api)
      .up()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HTTPError);
    expect((error as HTTPError).status).toBe(400);
    expect(upstream.received).toEqual([]);
  });
});

describe("pathWriter", () => {
  it("throws the error it is given for a value that would change the route", () => {
    const path = pathWriter((message) => new RangeError(message));

    expect(() => path`a/${".."}/b`).toThrow(RangeError);
    expect(() => path`a/${undefined}/b`).toThrow(RangeError);
    expect(path`a/${7}/b`).toBe("a/7/b");
  });
});

describe("probingPath", () => {
  it("writes each value as it is, since probing an endpoint sends nothing", () => {
    expect(probingPath`a/${".."}/b`).toBe("a/../b");
    expect(probingPath`a/${undefined}/b`).toBe("a/undefined/b");
  });
});

describe("a value a remote stream's or channel's closure puts into its path", () => {
  const { stream, channel } = courier();

  it("is sent as text, encoded, as an HTTP closure's is", () => {
    const feed = stream
      .variables<{ room: string }>()
      .via((sse, { room }) => sse.get(sse.path`rooms/${room}/feed`, undefined));
    const chat = channel
      .variables<{ room: string }>()
      .via((ws, { room }) => ws.connect(ws.path`rooms/${room}`, undefined));

    expect(addressCall(feed, "feed", { room: "a:b/c" })).toEqual({
      path: "rooms/a%3Ab%2Fc/feed",
      variables: undefined,
    });
    expect(addressCall(chat, "chat", { room: "lobby one" }).path).toBe("rooms/lobby%20one");
  });

  it("is refused as a stream's parameter is, where it would change the route", () => {
    const feed = stream
      .variables<{ room: string }>()
      .via((sse, { room }) => sse.get(sse.path`rooms/${room}/feed`, undefined));

    expect(() => addressCall(feed, "feed", { room: ".." })).toThrow(RealtimeValidationError);
  });

  it("is refused as an HTTP closure's is, where its segment would be . or .., or it is missing", () => {
    const file = stream
      .variables<{ name?: string; ext: string }>()
      .via((sse, { name, ext }) => sse.get(sse.path`files/${name}.${ext}`, undefined));

    expect(() => addressCall(file, "file", { name: "", ext: "." })).toThrow(
      new RealtimeValidationError(
        'A value put into the path makes its segment "..", which would change the route',
      ),
    );
    expect(() => addressCall(file, "file", { ext: "pdf" })).toThrow(RealtimeValidationError);
    expect(addressCall(file, "file", { name: "", ext: "pdf" }).path).toBe("files/.pdf");
  });
});
