/**
 * `multipartBody` writes fields as a `multipart/form-data` body whether a
 * file is among them or not, each part as a direct call writes a record that
 * holds a file. What no part carries is refused before anything is sent,
 * naming where it sits and not what it holds. A form already — a `FormData`,
 * or the upload a proxy sends on as it arrives — is returned as it is, so an
 * endpoint whose closure sends its fields with it reaches its upstream as a
 * form directly, and through the proxy in every upload mode: sent on as it
 * arrives, none of it kept.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import { createHandler } from "../src/adapter/create-handler";
import type { HandlerConfig } from "../src/adapter/handler-config";
import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup, multipartBody } from "../src/define/index";
import { toOpenAPI } from "../src/openapi";
import { buildPostPayload } from "../src/proxy-caller/post-payload";
import { _resetSourcesForTests } from "../src/sources";
import { type StreamedUpload, streamedUpload } from "../src/utils/streamed-upload";
import { formOf } from "../src/utils/variables-encoding";
import { chunked, readParts } from "./helpers/multipart-fixtures";

const { endpoint } = courier();

/** A part as a form holds it: its text, or a file's name, type and text. */
type Entry = [name: string, value: string | { name: string; type: string; text: string }];

async function entriesOf(form: FormData | undefined): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (const [name, value] of form ?? []) {
    entries.push([
      name,
      typeof value === "string"
        ? value
        : { name: value.name, type: value.type, text: await value.text() },
    ]);
  }
  return entries;
}

const cover = () => new File(["png"], "cover.png", { type: "image/png" });

describe("multipartBody", () => {
  it("writes each field as a direct call writes a record that holds a file", async () => {
    const fields = {
      title: "Dune",
      pages: 412,
      inPrint: true,
      published: new Date("2026-01-02T03:04:05.000Z"),
      tags: ["sf", "classic"],
      meta: { draft: false },
      nothing: null,
      skipped: undefined,
      cover: cover(),
      scans: [new Blob(["a"]), new Uint8Array([98])],
    };

    const entries = await entriesOf(multipartBody(fields));

    expect(entries).toEqual([
      ["title", "Dune"],
      ["pages", "412"],
      ["inPrint", "true"],
      ["published", "2026-01-02T03:04:05.000Z"],
      ["tags", "sf"],
      ["tags", "classic"],
      ["meta", '{"draft":false}'],
      ["cover", { name: "cover.png", type: "image/png", text: "png" }],
      ["scans", { name: "blob", type: "", text: "a" }],
      ["scans", { name: "blob", type: "", text: "b" }],
    ]);
    expect(entries).toEqual(await entriesOf(formOf(fields)));
  });

  it("is a form when no file is among the fields, which a direct call would send as JSON", async () => {
    const fields = { title: "Dune", pages: 412 };

    expect(await entriesOf(multipartBody(fields))).toEqual([
      ["title", "Dune"],
      ["pages", "412"],
    ]);
    expect(formOf(fields)).toBeUndefined();
    expect(await entriesOf(multipartBody({}))).toEqual([]);
  });

  it("keeps a field named __proto__ a field, and the prototype untouched", async () => {
    const fields: Record<string, unknown> = JSON.parse('{"__proto__":"x","title":"Dune"}');

    const form = multipartBody(fields);

    expect(await entriesOf(form)).toEqual([
      ["__proto__", "x"],
      ["title", "Dune"],
    ]);
    expect(Object.getPrototypeOf(form)).toBe(FormData.prototype);
  });

  it.each([
    ["a Set", { tags: new Set(["s3cr3t"]) }, "variables.tags"],
    ["a Map", { index: new Map([["k", "s3cr3t"]]) }, "variables.index"],
    ["a file deeper than a field", { meta: { note: "s3cr3t", cover: cover() } }, "variables.meta"],
    ["a stream", { body: new ReadableStream() }, "variables.body"],
  ])("refuses %s, naming where it sits and not what it holds", (_, fields, at) => {
    const refused = (() => {
      try {
        multipartBody(fields);
      } catch (error) {
        return error;
      }
      return undefined;
    })();

    expect(refused).toMatchObject({ code: "VARIABLE_NOT_ENCODABLE" });
    expect((refused as Error).message).toContain(at);
    expect((refused as Error).message).not.toContain("s3cr3t");
  });

  it.each([
    ["a list", ["Dune"]],
    ["a file", new Blob(["png"])],
    ["text", "Dune"],
  ])("refuses %s, which holds no named fields", (_, value) => {
    expect(() => multipartBody(value as unknown as Record<string, unknown>)).toThrow(
      expect.objectContaining({ code: "VARIABLE_NOT_ENCODABLE" }),
    );
  });

  it("returns a form as it is: a FormData, and the upload a proxy sends on as it arrives", () => {
    const form = new FormData();
    const upload = streamedUpload("multipart/form-data; boundary=b", {
      pull: (controller) => controller.close(),
    });

    expect(multipartBody(form)).toBe(form);
    expect(multipartBody(upload)).toBe(upload);
    expectTypeOf(multipartBody(form)).toEqualTypeOf<FormData>();
    expectTypeOf(multipartBody(upload)).toEqualTypeOf<StreamedUpload>();
    expectTypeOf(multipartBody({ title: "Dune" })).toEqualTypeOf<FormData>();
  });
});

/** A part as the upstream got it. */
type Part = [name: string, filename: string | undefined, text: string];

let upstream: Server | undefined;
const got: Part[][] = [];

afterEach(async () => {
  _resetSourcesForTests();
  got.length = 0;
  const server = upstream;
  upstream = undefined;
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
});

async function partsOf(req: IncomingMessage): Promise<Part[]> {
  const boundary = /^multipart\/form-data; boundary=(.+)$/.exec(req.headers["content-type"] ?? "");
  if (!boundary?.[1]) throw new Error(`no form: ${req.headers["content-type"]}`);
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const parts = await readParts(new Blob([Buffer.concat(chunks)]).stream(), boundary[1]);
  return parts.map((part) => [part.name, part.filename, new TextDecoder().decode(part.bytes)]);
}

/* An upstream that keeps the parts of each form it gets. */
function keepingParts(req: IncomingMessage, res: ServerResponse): void {
  partsOf(req).then(
    (parts) => {
      got.push(parts);
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    },
    () => res.writeHead(415).end(),
  );
}

/** An API whose cover upload is always a form, in front of an upstream that `answer` serves. */
async function coversApi(
  answer: (req: IncomingMessage, res: ServerResponse) => void = keepingParts,
) {
  upstream = createServer(answer);
  await new Promise<void>((resolve) => upstream?.listen(0, "127.0.0.1", resolve));
  const { port } = upstream.address() as AddressInfo;
  return defineApi({
    name: "api",
    baseURL: `http://127.0.0.1:${port}`,
    expose: true,
    groups: {
      covers: defineGroup({
        endpoints: {
          upload: endpoint
            .variables<{ title: string; cover?: Blob }>()
            .via((http, fields) => http.post("covers", undefined, { body: multipartBody(fields) })),
        },
      }),
    },
  });
}

/** A page's call of `covers.upload` through the proxy, sent as the proxy client sends it. */
function throughProxy(
  api: Awaited<ReturnType<typeof coversApi>>,
  variables: Record<string, unknown>,
  config: HandlerConfig = {},
): Promise<Response> {
  const payload = buildPostPayload(variables, {});
  const { handlePost } = createHandler({ sources: { api }, ...config });
  const sentAs =
    payload.json === undefined
      ? { type: payload.contentType, body: payload.body }
      : { type: "application/json", body: JSON.stringify(payload.json) };
  return handlePost(
    new Request("http://localhost/api/request?_s=api&_g=covers&_m=upload", {
      method: "POST",
      headers: { origin: "http://localhost", ...(sentAs.type && { "content-type": sentAs.type }) },
      body: sentAs.body,
    }),
  );
}

const sent: Part[] = [
  ["title", undefined, "Dune"],
  ["cover", "cover.png", "png"],
];

describe("an endpoint that sends its fields with multipartBody", () => {
  it("reaches its upstream as a form from a direct call, a file among its fields or not", async () => {
    const client = createCaller(await coversApi());

    await client.covers.upload({ title: "Dune", cover: cover() });
    await client.covers.upload({ title: "Dune" });

    expect(got).toEqual([sent, [["title", undefined, "Dune"]]]);
  });

  it.each([
    ["kept", {}],
    ["sent on as it arrives", { uploadMode: "stream" } as const],
  ])("reaches its upstream as the same form through the proxy, %s", async (_, config) => {
    const api = await coversApi();

    const withFile = await throughProxy(api, { title: "Dune", cover: cover() }, config);
    const withoutFile = await throughProxy(api, { title: "Dune" }, config);

    expect([withFile.status, withoutFile.status]).toEqual([200, 200]);
    expect(got).toEqual([sent, [["title", undefined, "Dune"]]]);
  });

  it("sends a record upload on, through the proxy, no faster than the upstream takes it, keeping none of it", async () => {
    const payload = buildPostPayload(
      { title: "Dune", cover: new File([new Uint8Array(16_000_000)], "cover.bin") },
      {},
    );
    if (payload.contentType === undefined) throw new Error("no record upload");
    const body = new Uint8Array(await payload.body.arrayBuffer());
    const cuts = Array.from({ length: Math.ceil(body.length / 16_384) }, (_, at) => at * 16_384);
    const { stream, pulls } = chunked(body, cuts);
    let received = 0;
    let lead = 0;
    const api = await coversApi((req, res) => {
      req.on("data", (chunk: Buffer) => {
        received += chunk.length;
        lead = Math.max(lead, pulls() * 16_384 - received);
      });
      req.on("end", () => res.end("{}"));
    });
    const { handlePost } = createHandler({
      sources: { api },
      uploadMode: "stream",
      maxUploadBytes: 32_000_000,
    });

    const answer = await handlePost(
      new Request("http://localhost/api/request?_s=api&_g=covers&_m=upload", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": payload.contentType,
          "content-length": String(body.length),
        },
        body: stream,
        // @ts-expect-error -- required by the platform for a streaming body
        duplex: "half",
      }),
    );

    expect(answer.status).toBe(200);
    expect(received).toBeGreaterThan(16_000_000);
    /* The parser and the sockets on the way hold some of it, more of it on a loaded machine;
       kept, the upload would be read whole before the upstream got a byte of it. */
    expect(lead).toBeLessThan(body.length / 2);
  });

  it("is described as taking multipart/form-data", async () => {
    const document = toOpenAPI(await coversApi());

    expect(Object.keys(document.paths["/covers"]?.post?.requestBody?.content ?? {})).toEqual([
      "multipart/form-data",
    ]);
  });
});
