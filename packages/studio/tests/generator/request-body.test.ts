/**
 * An endpoint's body is taken in the form its media type needs: a multipart
 * upload as a FormData, bytes as a Blob, a list as a list — whichever
 * validator the client was generated with, with its parameters beside it,
 * directly and through the proxy.
 */
import { createProxyCaller } from "@noverax/courier";
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
import { type UpstreamServer, startUpstreamServer } from "../helpers/upstream-server";

const media = (type: string, schema?: unknown) => ({
  required: true,
  content: { [type]: schema === undefined ? {} : { schema } },
});
const ok = { "200": { description: "ok" } };
const fileId = { name: "fileId", in: "path", required: true, schema: { type: "string" } };
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
              properties: { file: binary, note: { type: "string" } },
            }),
          }),
        },
        "/avatars": {
          post: op("uploadAvatar", {
            requestBody: media("multipart/form-data", { $ref: "#/components/schemas/AvatarUpload" }),
          }),
        },
        "/files/content": {
          post: op("uploadContent", {
            parameters: [{ name: "fields", in: "query", schema: strings }],
            requestBody: media("multipart/form-data", { type: "object", properties: { file: binary } }),
          }),
        },
        "/files/{fileId}": {
          put: op("replaceFile", { parameters: [fileId], requestBody: media("application/octet-stream", binary) }),
          delete: op("deleteVersions", { parameters: [fileId], requestBody: media("application/json", strings) }),
        },
        "/raw": { put: op("putRaw", { requestBody: media("application/octet-stream") }) },
        "/files/{fileId}/tags": {
          post: op("tagFile", { parameters: [fileId], requestBody: media("application/json", strings) }),
        },
        "/bulk": {
          post: op("bulkCreate", {
            requestBody: media("application/json", { type: "array", items: { $ref: "#/components/schemas/Item" } }),
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
    ["uploadFile", () => form({ file: new Blob(["png bytes"]), note: "hi" }), (r) => {
      expect(`${r.method} ${r.path}`).toBe("POST /v1/files");
      expect(r.contentType).toMatch(/^multipart\/form-data/);
      expect(r.body).toContain("png bytes");
      expect(r.body).toContain('name="note"');
    }],
    ["uploadAvatar", () => form({ image: new Blob(["avatar bytes"]) }), (r) => {
      expect(r.contentType).toMatch(/^multipart\/form-data/);
      expect(r.body).toContain("avatar bytes");
    }],
    ["uploadContent", () => form({ file: new Blob(["content"]), fields: "name" }), (r) => {
      expect(r.query).toEqual([["fields", "name"]]);
      expect(r.body).toContain("content");
      expect(r.body).not.toContain('name="fields"');
    }],
    ["tagFile", () => ({ fileId: "f1", body: ["a", "b"] }), (r) => {
      expect(`${r.method} ${r.path} ${r.body}`).toBe('POST /v1/files/f1/tags ["a","b"]');
    }],
    ["deleteVersions", () => ({ fileId: "f1", body: ["v1"] }), (r) => {
      expect(`${r.method} ${r.path} ${r.body}`).toBe('DELETE /v1/files/f1 ["v1"]');
      expect(r.query).toEqual([]);
    }],
    ["bulkCreate", () => [{ name: "a" }], (r) => {
      expect(`${r.method} ${r.path} ${r.body}`).toBe('POST /v1/bulk [{"name":"a"}]');
    }],
  ];
}

const DIRECT_ONLY: [string, () => unknown, string][] = [
  ["replaceFile", () => ({ fileId: "f1", body: new Blob(["file bytes"]) }), "PUT /v1/files/f1 file bytes"],
  ["putRaw", () => new Blob(["raw bytes"]), "PUT /v1/raw raw bytes"],
];

const CONSUMER = `import { shopApi } from "./src/api/shop";

export async function calls(form: FormData, file: Blob): Promise<void> {
  await shopApi.files.uploadFile(form);
  await shopApi.files.uploadAvatar(form);
  await shopApi.files.uploadContent(form);
  await shopApi.files.replaceFile({ fileId: "f1", body: file });
  await shopApi.files.putRaw(file);
  await shopApi.files.tagFile({ fileId: "f1", body: ["a"] });
  await shopApi.files.deleteVersions({ fileId: "f1", body: ["v1"] });
  await shopApi.files.bulkCreate([{ name: "a" }]);
  // @ts-expect-error a form is sent as a FormData
  await shopApi.files.uploadFile({ file: "x" });
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
  if (!request || more.length > 0) throw new Error(`expected one request, got ${upstream.requests.length}`);
  return request;
}

function generate(options: Partial<GenerateOptions>) {
  return generateCode(spec(upstream.origin), { type: "openapi", outputDir: "src/api", ...options }, "shop");
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
    const dir = writeProject(`request-body/${label}`, generate(options), { "consumer.ts": CONSUMER });
    const strictest = { ...STRICT, noUnusedLocals: true, noUnusedParameters: true };

    expect(compileProject(dir, ["consumer.ts"], strictest)).toEqual([]);
  }, 60_000);
});

describe("through the proxy", () => {
  let proxy: ProxyServer;

  beforeAll(async () => {
    proxy = await startProxyServer(loadGenerated(generate({}), "src/api/shop/source.ts"));
  });

  afterAll(async () => {
    await proxy.close();
  });

  it.each(calls())("sends %s's body as its media type asks", async (name, variables, check) => {
    const caller = createProxyCaller("shop", { proxyPath: { http: proxy.url } });
    upstream.requests.length = 0;

    await endpointAt(caller, "files", name)(variables());

    check(onlyRequest());
  });
});
