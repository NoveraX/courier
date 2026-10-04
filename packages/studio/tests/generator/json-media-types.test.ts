/**
 * A JSON body declared under a media type of its own — a JSON Patch, a merge
 * patch, JSON:API — is sent with that media type, not as
 * `application/json`: an API that tells a merge patch from a JSON Patch by
 * the media type — Kubernetes among them — answers that with 415.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSpec } from "../../src/apis/parser/types";
import { endpointAt, loadGenerated } from "../helpers/generated-project";
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

const Fields = {
  type: "object",
  properties: { name: { type: "string" }, tag: { type: "string" } },
};

const Patch = {
  type: "array",
  items: {
    type: "object",
    required: ["op", "path"],
    properties: { op: { type: "string" }, path: { type: "string" }, value: {} },
  },
};

const ok = {
  "200": { description: "ok", content: { "application/json": { schema: { type: "object" } } } },
};
const id = { name: "id", in: "path", required: true, schema: { type: "string" } };

function spec(origin: string): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Pets", version: "1" },
      servers: [{ url: origin }],
      paths: {
        "/pets": {
          post: {
            operationId: "createPet",
            tags: ["pets"],
            requestBody: {
              required: true,
              content: { "application/vnd.api+json": { schema: Fields } },
            },
            responses: ok,
          },
        },
        "/pets/{id}": {
          patch: {
            operationId: "mergePet",
            tags: ["pets"],
            parameters: [id],
            requestBody: {
              required: true,
              content: { "application/merge-patch+json": { schema: Fields } },
            },
            responses: ok,
          },
          put: {
            operationId: "replacePet",
            tags: ["pets"],
            parameters: [id],
            requestBody: { required: true, content: { "application/json": { schema: Fields } } },
            responses: ok,
          },
        },
        "/pets/{id}/ops": {
          patch: {
            operationId: "patchPet",
            tags: ["pets"],
            parameters: [id],
            requestBody: {
              required: true,
              content: { "application/json-patch+json": { schema: Patch } },
            },
            responses: ok,
          },
        },
      },
    }),
  );
}

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["zod", {}],
  ["no validation", { validation: "none" }],
];

let upstream: UpstreamServer;

beforeAll(async () => {
  upstream = await startUpstreamServer({ ok: true });
});

afterAll(async () => {
  await upstream.close();
});

describe.each(VARIANTS)("a generated client, %s", (_label, options) => {
  function client() {
    const files = generateCode(
      spec(upstream.origin),
      { type: "openapi", outputDir: "src/api", ...options },
      "pets",
    );
    const { petsApi } = loadGenerated(files, "src/api/pets/index.ts");
    return (method: string) => endpointAt(petsApi, "pets", method);
  }

  async function sent(call: () => Promise<unknown>) {
    upstream.requests.length = 0;
    await call();
    const [request] = upstream.requests;
    return {
      contentType: request?.contentType,
      path: request?.path,
      body: JSON.parse(request?.body ?? "null"),
    };
  }

  it("sends a merge patch as one", async () => {
    const call = client();
    const request = await sent(() => call("mergePet")({ id: "7", name: "Rex" }));

    expect(request).toEqual({
      contentType: "application/merge-patch+json",
      path: "/pets/7",
      body: { name: "Rex" },
    });
  });

  it("sends a JSON Patch as one", async () => {
    const call = client();
    const ops = [{ op: "replace", path: "/name", value: "Rex" }];
    const request = await sent(() => call("patchPet")({ id: "7", body: ops }));

    expect(request).toEqual({
      contentType: "application/json-patch+json",
      path: "/pets/7/ops",
      body: ops,
    });
  });

  it("sends a JSON:API document with its media type, without parameters to place", async () => {
    const call = client();
    const request = await sent(() => call("createPet")({ name: "Rex" }));

    expect(request).toEqual({
      contentType: "application/vnd.api+json",
      path: "/pets",
      body: { name: "Rex" },
    });
  });

  it("still sends plain JSON as application/json", async () => {
    const call = client();
    const request = await sent(() => call("replacePet")({ id: "7", name: "Rex" }));

    expect(request).toEqual({
      contentType: "application/json",
      path: "/pets/7",
      body: { name: "Rex" },
    });
  });
});
