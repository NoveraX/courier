/**
 * A record of variables that holds a file, called through the proxy. The page
 * sends it as a record upload — its options, the record with `null` where each
 * file sat, then the files — under a media type of its own, and the proxy
 * restores the record, so its schema, its middleware and its closure see
 * what a direct call sees. The upstream gets the parts it gets from a direct
 * call, whether the proxy keeps the upload or sends it on as it arrives.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createHandler } from "../src/adapter/create-handler";
import type { HandlerConfig } from "../src/adapter/handler-config";
import { readRecordUpload } from "../src/adapter/multipart/read-record";
import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { createProxyCaller } from "../src/proxy-caller";
import { buildPostPayload } from "../src/proxy-caller/post-payload";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { RECORD_UPLOAD_TYPE } from "../src/utils/record-upload";
import { readParts } from "./helpers/multipart-fixtures";
import { seededIntegers } from "./helpers/seeded-random";

const { endpoint } = courier();

/** A part as the upstream got it. */
type Part = [name: string, filename: string | undefined, type: string | undefined, text: string];

let upstream: Server | undefined;
const got: Array<{ url: string; parts: Part[] }> = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  got.length = 0;
  const server = upstream;
  upstream = undefined;
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
});

async function partsOf(req: IncomingMessage): Promise<Part[]> {
  const boundary = /boundary=(.+)$/.exec(req.headers["content-type"] ?? "")?.[1];
  if (boundary === undefined) throw new Error(`no form: ${req.headers["content-type"]}`);
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const parts = await readParts(new Blob([Buffer.concat(chunks)]).stream(), boundary);
  return parts.map((part) => [
    part.name,
    part.filename,
    part.type,
    new TextDecoder().decode(part.bytes),
  ]);
}

/** The API, in front of an upstream that keeps the parts of each form it gets. */
async function apiWith(endpoints: Record<string, unknown>) {
  upstream = createServer((req, res) => {
    void partsOf(req).then((parts) => {
      got.push({ url: req.url ?? "", parts });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => upstream?.listen(0, "127.0.0.1", resolve));
  const { port } = upstream.address() as AddressInfo;
  return defineApi({
    name: "api",
    baseURL: `http://127.0.0.1:${port}`,
    expose: true,
    groups: { books: defineGroup({ endpoints } as Parameters<typeof defineGroup>[0]) },
  });
}

type Api = Awaited<ReturnType<typeof apiWith>>;

/** A page's call of `books.<method>` through the proxy, sent as the proxy client sends it. */
async function throughProxy(
  api: Api,
  method: string,
  record: Record<string, unknown>,
  config: HandlerConfig = {},
): Promise<Response> {
  const payload = buildPostPayload(record, {});
  if (payload.contentType === undefined) throw new Error("no record upload");
  const { handlePost } = createHandler({ sources: { api }, ...config });
  return handlePost(
    new Request(`http://localhost/api/request?_s=api&_g=books&_m=${method}`, {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": payload.contentType },
      body: payload.body,
    }),
  );
}

const cover = () => new File(["png"], "cover.png", { type: "image/png" });

/** A direct caller of the API's books, typed loosely: the tests make records of any shape. */
function directly(api: Api) {
  return (
    createCaller(api) as unknown as {
      books: Record<string, (variables: unknown) => Promise<unknown>>;
    }
  ).books;
}

describe("a record that holds a file, through the proxy", () => {
  it("goes as a record upload, under a media type no form has", async () => {
    const payload = buildPostPayload({ title: "Dune", cover: cover() }, { timeout: 5_000 });

    expect(payload.contentType).toMatch(new RegExp(`^${RECORD_UPLOAD_TYPE}; boundary=`));
    expect(payload.body).toBeInstanceOf(Blob);
  });

  it.each([
    ["kept", {}],
    ["sent on as it arrives", { uploadMode: "stream" } as const],
  ])("reaches the upstream with the parts a direct call sends, %s", async (_, config) => {
    const api = await apiWith({
      setCover: endpoint.post("cover").variables<Record<string, unknown>>(),
    });
    const record = () => ({ title: "Dune", cover: cover(), tags: ["a", "b"], meta: { n: 1 } });

    await directly(api).setCover?.(record());
    const answer = await throughProxy(api, "setCover", record(), config);

    expect(answer.status).toBe(200);
    expect(got[1]?.parts).toEqual(got[0]?.parts);
    expect(got[0]?.parts).toEqual([
      ["title", undefined, undefined, "Dune"],
      ["cover", "cover.png", "image/png", "png"],
      ["tags", undefined, undefined, "a"],
      ["tags", undefined, undefined, "b"],
      ["meta", undefined, undefined, '{"n":1}'],
    ]);
  });

  it("fills the path from the record, kept", async () => {
    const api = await apiWith({
      setCover: endpoint.post(":bookId/cover").variables<Record<string, unknown>>(),
    });

    const answer = await throughProxy(api, "setCover", { bookId: "b7", cover: cover() });

    expect(answer.status).toBe(200);
    expect(got[0]?.url).toBe("/b7/cover");
    expect(got[0]?.parts.map(([name]) => name)).toEqual(["cover"]);
  });

  it("is the record the endpoint's schema checks, on the server", async () => {
    const api = await apiWith({
      setCover: endpoint
        .post("cover")
        .variables(z.object({ title: z.string(), cover: z.instanceof(File) })),
    });

    const answer = await throughProxy(api, "setCover", { title: "Dune", cover: cover() });

    expect(answer.status).toBe(200);
    expect(got[0]?.parts.map(([name]) => name)).toEqual(["title", "cover"]);
  });

  it("is what a page's proxy client sends, a file in a list of them too", async () => {
    const api = await apiWith({
      addPhotos: endpoint.post("photos").variables<Record<string, unknown>>(),
    });
    registerSources({ api });
    const client = createProxyCaller(routesOf(api, "api")) as unknown as {
      books: { addPhotos: (variables: unknown) => Promise<unknown> };
    };

    await client.books.addPhotos({ album: "x", photos: [new Blob(["1"]), new Blob(["2"])] });

    expect(got[0]?.parts).toEqual([
      ["album", undefined, undefined, "x"],
      ["photos", "blob", "application/octet-stream", "1"],
      ["photos", "blob", "application/octet-stream", "2"],
    ]);
  });

  it.each([
    [
      "a file deeper than a field",
      { meta: { avatar: new Blob(["a"]) }, cover: new Blob(["b"]) },
      "variables.meta.avatar",
    ],
    [
      "a stream in a field",
      { cover: new Blob(["b"]), body: new Blob(["a"]).stream() },
      "variables.body",
    ],
    ["a Set", { cover: new Blob(["b"]), tags: new Set(["a"]) }, "variables.tags"],
    ["a BigInt", { cover: new Blob(["b"]), value: 12n }, "variables.value is a BigInt"],
    [
      "a BigInt in an object",
      { cover: new Blob(["b"]), meta: { value: 12n } },
      "variables.meta.value is a BigInt",
    ],
  ])("refuses %s before anything is sent", async (_, record, said) => {
    expect(() => buildPostPayload(record, {})).toThrow(
      expect.objectContaining({
        code: "VARIABLE_NOT_ENCODABLE",
        message: expect.stringContaining(said),
      }),
    );
  });
});

describe("a BigInt", () => {
  it("is refused on a page as in a direct call, where it sits, JSON or form alike", async () => {
    const api = await apiWith({ save: endpoint.post("save").variables<Record<string, unknown>>() });
    registerSources({ api });
    const page = createProxyCaller(routesOf(api, "api")) as unknown as {
      books: { save: (variables: unknown) => Promise<unknown> };
    };
    const refusalOf = (call: Promise<unknown> | undefined) =>
      call?.catch((error: unknown) => error);

    const refusals = [
      await refusalOf(page.books.save({ meta: { value: 12n } })),
      await refusalOf(page.books.save({ cover: new Blob(["b"]), value: 12n })),
      await refusalOf(directly(api).save?.({ cover: new Blob(["b"]), value: 12n })),
    ];

    expect(refusals).toEqual([
      expect.objectContaining({
        code: "VARIABLE_NOT_ENCODABLE",
        message: expect.stringContaining("variables.meta.value is a BigInt"),
      }),
      expect.objectContaining({ message: expect.stringContaining("variables.value is a BigInt") }),
      expect.objectContaining({ message: expect.stringContaining("variables.value is a BigInt") }),
    ]);
    expect(got).toHaveLength(0);
  });

  it("is written as a toJSON of the program's own says, through the proxy as directly", async () => {
    const api = await apiWith({ save: endpoint.post("save").variables<Record<string, unknown>>() });
    Object.defineProperty(BigInt.prototype, "toJSON", {
      configurable: true,
      value(this: bigint) {
        return this.toString();
      },
    });
    try {
      await directly(api).save?.({ cover: new Blob(["b"]), value: 12n });
      await throughProxy(api, "save", { cover: new Blob(["b"]), value: 12n });
    } finally {
      Reflect.deleteProperty(BigInt.prototype, "toJSON");
    }

    expect(got[0]?.parts).toEqual([
      ["cover", "blob", "application/octet-stream", "b"],
      ["value", undefined, undefined, "12"],
    ]);
    expect(got[1]?.parts).toEqual(got[0]?.parts);
  });
});

describe("a record upload the proxy cannot restore", () => {
  /** A record upload's body, its parts written as given. */
  function body(
    parts: Array<[name: string, value: string] | [name: string, value: string, filename: string]>,
  ) {
    const form = new FormData();
    for (const [name, value, filename] of parts) {
      if (filename === undefined) form.append(name, value);
      else form.append(name, new Blob([value]), filename);
    }
    return form;
  }

  async function sent(form: FormData, config: HandlerConfig = {}): Promise<Response> {
    const api = await apiWith({
      setCover: endpoint.post("cover").variables<Record<string, unknown>>(),
    });
    const { handlePost } = createHandler({ sources: { api }, ...config });
    const framed = new Response(form);
    const type = framed.headers
      .get("content-type")
      ?.replace("multipart/form-data", RECORD_UPLOAD_TYPE);
    return handlePost(
      new Request("http://localhost/api/request?_s=api&_g=books&_m=setCover", {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": type ?? "" },
        body: await framed.arrayBuffer(),
      }),
    );
  }

  const record = (variables: unknown, files: unknown) => JSON.stringify({ variables, files });

  it.each<[string, Array<[string, string] | [string, string, string]>]>([
    [
      "holds no record part",
      [
        ["_options", "{}"],
        ["cover", "png", "c.png"],
      ],
    ],
    ["ends after its options, holding no record", [["_options", "{}"]]],
    [
      "holds no JSON where its record goes",
      [
        ["_options", "{}"],
        ["_variables", "{"],
      ],
    ],
    [
      "names a place that holds no null",
      [
        ["_options", "{}"],
        ["_variables", record({ cover: "x" }, [["cover"]])],
        ["cover", "png", "c.png"],
      ],
    ],
    [
      "names a place twice",
      [
        ["_options", "{}"],
        ["_variables", record({ cover: null }, [["cover"], ["cover"]])],
        ["cover", "png", "c.png"],
      ],
    ],
    [
      "names a place deeper than a list's item",
      [
        ["_options", "{}"],
        ["_variables", record({ a: { b: null } }, [["a", "b"]])],
      ],
    ],
    [
      "sends a file it names no place for",
      [
        ["_options", "{}"],
        ["_variables", record({ cover: null }, [["cover"]])],
        ["cover", "png", "c.png"],
        ["extra", "x", "x.bin"],
      ],
    ],
    [
      "leaves out a file it names",
      [
        ["_options", "{}"],
        ["_variables", record({ cover: null, back: null }, [["cover"], ["back"]])],
        ["cover", "png", "c.png"],
      ],
    ],
    [
      "sends a file under another field",
      [
        ["_options", "{}"],
        ["_variables", record({ cover: null }, [["cover"]])],
        ["back", "png", "c.png"],
      ],
    ],
    [
      "sends text where a file goes",
      [
        ["_options", "{}"],
        ["_variables", record({ cover: null }, [["cover"]])],
        ["cover", "png"],
      ],
    ],
  ])("is refused with 400 when it %s, and nothing reaches the upstream", async (_, parts) => {
    for (const config of [{}, { uploadMode: "stream" } as const]) {
      const answer = await sent(body(parts), config);

      expect.soft(answer.status, JSON.stringify(config)).toBeGreaterThanOrEqual(400);
      expect
        .soft(await answer.json(), JSON.stringify(config))
        .toMatchObject({ code: "BODY_MALFORMED" });
    }
    expect(got).toHaveLength(0);
  });

  it("puts nothing on any object's prototype", async () => {
    const parts: Array<[string, string] | [string, string, string]> = [
      ["_options", "{}"],
      [
        "_variables",
        '{"variables":{"__proto__":{"polluted":true},"cover":null},"files":[["cover"]]}',
      ],
      ["cover", "png", "c.png"],
    ];

    const answer = await sent(body(parts));

    expect(answer.status).toBe(200);
    expect(Reflect.get({}, "polluted")).toBeUndefined();
  });

  it("holds its record to the text the upload may carry, maxBodyBytes", async () => {
    const big = "x".repeat(2_048);
    const parts: Array<[string, string] | [string, string, string]> = [
      ["_options", "{}"],
      ["_variables", record({ big, cover: null }, [["cover"]])],
      ["cover", "png", "c.png"],
    ];

    const answer = await sent(body(parts), { maxBodyBytes: 1_024 });

    expect(answer.status).toBe(413);
    expect(await answer.json()).toMatchObject({ code: "UPLOAD_FIELDS_TOO_LARGE" });
  });
});

describe("a record upload read by a server other than the proxy", () => {
  it("is the record the page sent, each file at its place", async () => {
    const payload = buildPostPayload(
      { title: "Dune", cover: cover(), photos: ["x", new Blob(["2"])] },
      { timeout: 5_000 },
    );
    if (payload.contentType === undefined) throw new Error("no record upload");

    const { options, variables } = await readRecordUpload(
      payload.body.stream(),
      payload.contentType,
      {
        maxFieldBytes: 4_096,
      },
    );

    expect(JSON.parse(options ?? "")).toEqual({ timeout: 5_000 });
    expect(variables).toMatchObject({ title: "Dune", photos: ["x", expect.any(File)] });
    expect(await (variables.cover as File).text()).toBe("png");
  });
});

describe("a form a page sends", () => {
  it("stays a form, whatever its first field is named", async () => {
    const api = await apiWith({ upload: endpoint.post("upload").variables<FormData>() });
    const form = new FormData();
    form.append("_variables", "not a record");
    form.append("file", new Blob(["x"]), "x.bin");
    const payload = buildPostPayload(form, {});
    const { handlePost } = createHandler({ sources: { api } });
    const framed = new Response(payload.body);

    const answer = await handlePost(
      new Request("http://localhost/api/request?_s=api&_g=books&_m=upload", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": framed.headers.get("content-type") ?? "",
        },
        body: await framed.arrayBuffer(),
      }),
    );

    expect(answer.status).toBe(200);
    expect(got[0]?.parts.map(([name]) => name)).toEqual(["_variables", "file"]);
  });
});

describe("records of any shape", () => {
  it("reach the upstream through the proxy as a direct call sends them, kept or sent on", async () => {
    const pick = seededIntegers(20_261_106);
    const api = await apiWith({ save: endpoint.post("save").variables<Record<string, unknown>>() });
    class Stamp {
      constructor(readonly text: string) {}
      toJSON(): string {
        return this.text;
      }
    }
    /* Values JSON writes otherwise than their own way: by their toJSON, as null, or not at all. */
    const scalar = (): unknown =>
      [
        `t${pick(100)}`,
        "two\nlines",
        pick(1_000),
        pick(2) === 0,
        null,
        undefined,
        new Date(Date.UTC(2026, pick(12), 1)),
        new Stamp(`s${pick(100)}`),
        () => "made-up-source",
        Number.NaN,
        Number.NEGATIVE_INFINITY,
        new Date(Number.NaN),
        Symbol("s"),
      ][pick(13)];
    const file = (): Blob =>
      pick(2) === 0
        ? new File([`f${pick(100)}`], `f${pick(9)}.bin`, { type: "application/x-test" })
        : new Blob([`b${pick(100)}`]);
    const value = (): unknown => {
      const kind = pick(5);
      if (kind === 0) return file();
      if (kind === 1)
        return Array.from({ length: pick(4) }, () => (pick(2) === 0 ? file() : scalar()));
      if (kind === 2) return { nested: scalar(), list: [scalar(), scalar()] };
      return scalar();
    };

    for (let run = 0; run < 40; run++) {
      const fields = Array.from({ length: 1 + pick(5) }, (_, index) => [`field${index}`, value()]);
      const make = (): Record<string, unknown> => ({
        ...Object.fromEntries(fields),
        anchor: new Blob(["anchor"]),
      });

      got.length = 0;
      await directly(api).save?.(make());
      await throughProxy(api, "save", make());
      await throughProxy(api, "save", make(), { uploadMode: "stream" });

      expect.soft(got[1]?.parts, `run ${run}`).toEqual(got[0]?.parts);
      expect.soft(got[2]?.parts, `run ${run}`).toEqual(got[0]?.parts);
    }
  });
});
