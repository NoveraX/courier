/**
 * An endpoint's body is taken in the form its media type needs: a multipart
 * upload whose schema names its fields as a record of them, a file a Blob,
 * sent as a form whether a file is among them or not; one whose schema names
 * none as a FormData; bytes as a Blob, a list as a list — whichever
 * validator the client was generated with, with its parameters beside it,
 * directly and through the proxy.
 */

import { createProxyCaller } from "@noverax/courier";
import { routesOf } from "@noverax/courier/internal";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSpec } from "../../src/apis/parser/types";
import {
  compileProject,
  endpointAt,
  loadGenerated,
  removeProjects,
  STRICT,
  writeProject,
} from "../helpers/generated-project";
import { type ProxyServer, startProxyServer } from "../helpers/proxy-server";
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

const media = (type: string, schema?: unknown) => ({
  required: true,
  content: { [type]: schema === undefined ? {} : { schema } },
});
const ok = { "200": { description: "ok" } };
const fileId = { name: "fileId", in: "path", required: true, schema: { type: "string" } };
const profileId = { name: "profileId", in: "path", required: true, schema: { type: "string" } };
const uploadToken = {
  name: "X-Upload-Token",
  in: "header",
  required: true,
  schema: { type: "string" },
};
const binary = { type: "string", format: "binary" };
const strings = { type: "array", items: { type: "string" } };

function spec(origin: string): ParsedSpec {
  const op = (operationId: string, extra: Record<string, unknown>) => ({
    operationId,
    tags: ["files"],
    responses: ok,
    ...extra,
  });
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Shop", version: "1" },
      servers: [{ url: `${origin}/v1` }],
      paths: {
        "/files": {
          post: op("uploadFile", {
            requestBody: media("multipart/form-data", {
              type: "object",
              required: ["file"],
              properties: {
                file: binary,
                note: { type: "string" },
                extras: { type: "array", items: binary },
              },
            }),
          }),
        },
        "/avatars": {
          post: op("uploadAvatar", {
            requestBody: media("multipart/form-data", {
              $ref: "#/components/schemas/AvatarUpload",
            }),
          }),
        },
        "/files/content": {
          post: op("uploadContent", {
            parameters: [{ name: "fields", in: "query", schema: strings }],
            requestBody: media("multipart/form-data", {
              type: "object",
              properties: { file: binary },
            }),
          }),
        },
        "/profiles/{profileId}": {
          put: op("updateProfile", {
            parameters: [profileId, uploadToken],
            requestBody: media("multipart/form-data", {
              type: "object",
              required: ["name"],
              properties: { name: { type: "string" }, age: { type: "integer" }, photo: binary },
            }),
          }),
        },
        "/files/{fileId}/copies": {
          post: op("copyFile", {
            parameters: [fileId],
            requestBody: media("multipart/form-data", {
              type: "object",
              required: ["fileId", "file"],
              properties: { fileId: { type: "string" }, file: binary },
            }),
          }),
        },
        "/inbox": { post: op("dropAnything", { requestBody: media("multipart/form-data") }) },
        "/files/{fileId}": {
          put: op("replaceFile", {
            parameters: [fileId],
            requestBody: media("application/octet-stream", binary),
          }),
          delete: op("deleteVersions", {
            parameters: [fileId],
            requestBody: media("application/json", strings),
          }),
        },
        "/raw": { put: op("putRaw", { requestBody: media("application/octet-stream") }) },
        "/files/{fileId}/tags": {
          post: op("tagFile", {
            parameters: [fileId],
            requestBody: media("application/json", strings),
          }),
        },
        "/bulk": {
          post: op("bulkCreate", {
            requestBody: media("application/json", {
              type: "array",
              items: { $ref: "#/components/schemas/Item" },
            }),
          }),
        },
      },
      components: {
        schemas: {
          AvatarUpload: { type: "object", required: ["image"], properties: { image: binary } },
          Item: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
        },
      },
    }),
  );
}

function form(entries: Record<string, string | Blob>): FormData {
  const body = new FormData();
  for (const [key, value] of Object.entries(entries)) body.append(key, value);
  return body;
}

/** Each call, and what the server has to receive for it. */
function calls(): [string, () => unknown, (r: UpstreamServer["requests"][number]) => void][] {
  return [
    [
      "uploadFile",
      () => ({
        file: new Blob(["png bytes"]),
        note: "hi",
        extras: [new Blob(["first extra"]), new Blob(["second extra"])],
      }),
      (r) => {
        expect(`${r.method} ${r.path}`).toBe("POST /v1/files");
        expect(r.contentType).toMatch(/^multipart\/form-data/);
        expect(r.body).toContain("png bytes");
        expect(r.body).toContain('name="note"');
        expect(r.body.match(/name="extras"; filename=/g)).toHaveLength(2);
        expect(r.body).toContain("first extra");
        expect(r.body).toContain("second extra");
      },
    ],
    [
      "uploadAvatar",
      () => ({ image: new Blob(["avatar bytes"]) }),
      (r) => {
        expect(r.contentType).toMatch(/^multipart\/form-data/);
        expect(r.body).toContain("avatar bytes");
      },
    ],
    [
      "uploadContent",
      () => ({ file: new Blob(["content"]), fields: ["name"] }),
      (r) => {
        expect(r.query).toEqual([["fields", "name"]]);
        expect(r.body).toContain("content");
        expect(r.body).not.toContain('name="fields"');
      },
    ],
    [
      "updateProfile",
      () => ({ profileId: "p1", "X-Upload-Token": "t1", name: "Ada", age: 36 }),
      (r) => {
        expect(`${r.method} ${r.path}`).toBe("PUT /v1/profiles/p1");
        /* No file among the fields, and a form all the same. */
        expect(r.contentType).toMatch(/^multipart\/form-data/);
        expect(r.body).toMatch(/name="name"\r\n\r\nAda\r\n/);
        expect(r.body).toMatch(/name="age"\r\n\r\n36\r\n/);
        expect(r.body).not.toContain("profileId");
        expect(r.body).not.toContain("X-Upload-Token");
        expect(r.headers["x-upload-token"]).toBe("t1");
      },
    ],
    [
      /* A field named as a parameter: a file travels through the proxy in a
         field of the variables, so the form stays a FormData. */
      "copyFile",
      () => form({ fileId: "f1", file: new Blob(["copy bytes"]) }),
      (r) => {
        expect(`${r.method} ${r.path}`).toBe("POST /v1/files/f1/copies");
        expect(r.contentType).toMatch(/^multipart\/form-data/);
        expect(r.body).toContain("copy bytes");
      },
    ],
    [
      "dropAnything",
      () => form({ anything: new Blob(["dropped"]) }),
      (r) => {
        expect(r.contentType).toMatch(/^multipart\/form-data/);
        expect(r.body).toContain("dropped");
      },
    ],
    [
      "tagFile",
      () => ({ fileId: "f1", body: ["a", "b"] }),
      (r) => {
        expect(`${r.method} ${r.path} ${r.body}`).toBe('POST /v1/files/f1/tags ["a","b"]');
      },
    ],
    [
      "deleteVersions",
      () => ({ fileId: "f1", body: ["v1"] }),
      (r) => {
        expect(`${r.method} ${r.path} ${r.body}`).toBe('DELETE /v1/files/f1 ["v1"]');
        expect(r.query).toEqual([]);
      },
    ],
    [
      "bulkCreate",
      () => [{ name: "a" }],
      (r) => {
        expect(`${r.method} ${r.path} ${r.body}`).toBe('POST /v1/bulk [{"name":"a"}]');
      },
    ],
  ];
}

const DIRECT_ONLY: [string, () => unknown, string][] = [
  [
    "replaceFile",
    () => ({ fileId: "f1", body: new Blob(["file bytes"]) }),
    "PUT /v1/files/f1 file bytes",
  ],
  ["putRaw", () => new Blob(["raw bytes"]), "PUT /v1/raw raw bytes"],
];

const CONSUMER = `import { shopApi } from "./src/api/shop";

export async function calls(form: FormData, file: Blob): Promise<void> {
  await shopApi.files.uploadFile({ file, note: "hi", extras: [file, file] });
  await shopApi.files.uploadFile({ file });
  await shopApi.files.uploadAvatar({ image: file });
  await shopApi.files.uploadContent({ file, fields: ["name"] });
  await shopApi.files.uploadContent({});
  await shopApi.files.updateProfile({ profileId: "p1", "X-Upload-Token": "t", name: "Ada" });
  await shopApi.files.updateProfile({
    profileId: "p1",
    "X-Upload-Token": "t",
    name: "Ada",
    age: 36,
    photo: file,
  });
  await shopApi.files.copyFile(form);
  await shopApi.files.dropAnything(form);
  await shopApi.files.replaceFile({ fileId: "f1", body: file });
  await shopApi.files.putRaw(file);
  await shopApi.files.tagFile({ fileId: "f1", body: ["a"] });
  await shopApi.files.deleteVersions({ fileId: "f1", body: ["v1"] });
  await shopApi.files.bulkCreate([{ name: "a" }]);
  // @ts-expect-error a form's file is a Blob
  await shopApi.files.uploadFile({ file: "x" });
  // @ts-expect-error each of a list of files is a Blob
  await shopApi.files.uploadFile({ file, extras: ["x"] });
  // @ts-expect-error a form whose fields the schema names is called with them
  await shopApi.files.uploadFile(form);
  // @ts-expect-error the file is required
  await shopApi.files.uploadFile({ note: "hi" });
  // @ts-expect-error the header is required
  await shopApi.files.updateProfile({ profileId: "p1", name: "Ada" });
  // @ts-expect-error a form whose schema names no fields is sent as a FormData
  await shopApi.files.dropAnything({ anything: file });
  // @ts-expect-error so is one a field of which is named as a parameter
  await shopApi.files.copyFile({ fileId: "f1", file });
  // @ts-expect-error the bytes are a Blob
  await shopApi.files.replaceFile({ fileId: "f1", body: "text" });
  // @ts-expect-error a tag is text
  await shopApi.files.tagFile({ fileId: "f1", body: [1] });
}
`;

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["zod", {}],
  ["valibot", { validation: "valibot" }],
  ["arktype", { validation: "arktype" }],
  ["none", { validation: "none" }],
  ["types-only", { generateSchemas: false }],
];

let upstream: UpstreamServer;

beforeAll(async () => {
  upstream = await startUpstreamServer({});
});

afterAll(async () => {
  await upstream.close();
  removeProjects("request-body");
});

/** The one request the server received. */
function onlyRequest(): UpstreamServer["requests"][number] {
  const [request, ...more] = upstream.requests;
  if (!request || more.length > 0)
    throw new Error(`expected one request, got ${upstream.requests.length}`);
  return request;
}

function generate(options: Partial<GenerateOptions>) {
  return generateCode(
    spec(upstream.origin),
    { type: "openapi", outputDir: "src/api", ...options },
    "shop",
  );
}

describe.each(VARIANTS)("a generated client validated with %s", (label, options) => {
  it.each(calls())("sends %s's body as its media type asks", async (name, variables, check) => {
    const { shopApi } = loadGenerated(generate(options), "src/api/shop/index.ts");
    upstream.requests.length = 0;

    await endpointAt(shopApi, "files", name)(variables());

    check(onlyRequest());
  });

  it.each(DIRECT_ONLY)("sends %s's bytes as they are", async (name, variables, request) => {
    const { shopApi } = loadGenerated(generate(options), "src/api/shop/index.ts");
    upstream.requests.length = 0;

    await endpointAt(shopApi, "files", name)(variables());

    expect(upstream.requests.map((r) => `${r.method} ${r.path} ${r.body}`)).toEqual([request]);
  });

  it("types each body as its media type asks", () => {
    const dir = writeProject(`request-body/${label}`, generate(options), {
      "consumer.ts": CONSUMER,
    });
    const strictest = { ...STRICT, noUnusedLocals: true, noUnusedParameters: true };

    expect(compileProject(dir, ["consumer.ts"], strictest)).toEqual([]);
  }, 60_000);
});

describe("through the proxy", () => {
  let proxy: ProxyServer;
  let routes: ReturnType<typeof routesOf<Record<string, unknown>>>;

  beforeAll(async () => {
    const loaded = loadGenerated(generate({ generateClient: "both" }), "src/api/shop/source.ts");
    routes = routesOf(loaded.shop as Record<string, unknown>, "shop");
    proxy = await startProxyServer(loaded);
  });

  afterAll(async () => {
    await proxy.close();
  });

  it.each(calls())("sends %s's body as its media type asks", async (name, variables, check) => {
    const caller = createProxyCaller(routes, { proxyPath: { http: proxy.url } });
    upstream.requests.length = 0;

    await endpointAt(caller, "files", name)(variables());

    check(onlyRequest());
  });
});
