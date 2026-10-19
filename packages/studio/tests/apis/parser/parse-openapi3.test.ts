/**
 * What an OpenAPI specification as a whole turns into, checked by calling
 * the generated client against a real server.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateCode } from "../../../src/apis/generator";
import { parseSpec } from "../../../src/apis/parser";
import { generatedCall, loadGenerated } from "../../helpers/generated-project";
import { type RecordingServer, startRecordingServer } from "../../helpers/recording-server";

let server: RecordingServer;

beforeAll(async () => {
  server = await startRecordingServer(() => ({ contentType: "application/json", body: "[]" }));
});

afterAll(async () => {
  await server.close();
});

function specServedAt(servers: unknown[]): string {
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Nodes", version: "1" },
    servers,
    paths: {
      "/nodes": {
        get: {
          tags: ["nodes"],
          operationId: "listNodes",
          responses: { "200": { description: "ok" } },
        },
      },
    },
  });
}

function listNodes(spec: string) {
  const files = generateCode(parseSpec(spec), { type: "openapi", outputDir: "src" }, "cluster");
  return generatedCall(loadGenerated(files, "src/cluster/index.ts"), [
    "clusterApi",
    "nodes",
    "listNodes",
  ]);
}

describe("a server URL with variables", () => {
  it("is reached at the address its defaults fill in", async () => {
    const { port } = new URL(server.url);
    const spec = specServedAt([
      {
        url: "http://{host}:{port}/{basePath}",
        variables: {
          host: { default: "127.0.0.1" },
          port: { default: port, enum: [port, "443"] },
          basePath: { default: "api" },
        },
      },
    ]);

    await listNodes(spec)();

    expect(parseSpec(spec).baseURL).toBe(`${server.url}/api`);
    expect(server.requests.at(-1)).toMatchObject({ method: "GET", path: "/api/nodes" });
  });

  it("keeps a URL without variables as it is written", () => {
    expect(parseSpec(specServedAt([{ url: "https://api.example.com/v2" }])).baseURL).toBe(
      "https://api.example.com/v2",
    );
  });
});

const answers = { responses: { "200": { description: "ok" } } };

function document(paths: Record<string, unknown>, components: Record<string, unknown> = {}) {
  return JSON.stringify({
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths,
    components,
  });
}

describe("a path item written as a reference", () => {
  it("is followed to the path item this document declares", () => {
    const parsed = parseSpec(
      document(
        { "/x": { $ref: "#/components/pathItems/X" } },
        { pathItems: { X: { get: { operationId: "getX", ...answers } } } },
      ),
    );

    expect(parsed.groups.flatMap((group) => group.endpoints.map((e) => e.name))).toEqual(["getX"]);
    expect(parsed.skipped).toEqual([]);
  });

  it("is left out, and said so, when this document does not declare it", () => {
    const parsed = parseSpec(
      document({
        "/x": { $ref: "#/components/pathItems/Missing" },
        "/y": { $ref: "./other.yaml#/Y" },
      }),
    );

    expect(parsed.skipped.map(({ path, reason }) => [path, reason])).toEqual([
      ["/x", "path item references #/components/pathItems/Missing, which is not in this document"],
      ["/y", "path item references ./other.yaml#/Y, which is not in this document"],
    ]);
  });
});

describe("a parameter written as a reference this document does not declare", () => {
  it("is left out of its operation, and said so", () => {
    const parsed = parseSpec(
      document({
        "/a/{id}": {
          get: {
            operationId: "getA",
            parameters: [
              { name: "id", in: "path", required: true, schema: { type: "string" } },
              { $ref: "#/components/parameters/Missing" },
            ],
            ...answers,
          },
        },
      }),
    );

    expect(parsed.groups[0]?.endpoints[0]?.parameters.map((p) => p.name)).toEqual(["id"]);
    expect(parsed.skipped).toEqual([
      {
        method: "GET",
        path: "/a/{id}",
        reason:
          "parameter #/components/parameters/Missing is not in this document, so it is left out",
      },
    ]);
  });
});

describe("a reference whose percent escape is malformed", () => {
  it("types the schema it names as one this document does not define, and parses the rest", () => {
    const parsed = parseSpec(
      document(
        { "/pets": { get: { operationId: "listPets", ...answers } } },
        {
          schemas: {
            Pet: {
              type: "object",
              properties: { id: { type: "string" }, owner: { $ref: "#/components/schemas/%zz" } },
            },
          },
        },
      ),
    );

    expect(parsed.schemas.Pet?.properties?.id?.type).toBe("string");
    expect(parsed.schemas.Pet?.properties?.owner?.type).toBe("any");
    expect(parsed.groups.flatMap((group) => group.endpoints.map((e) => e.name))).toEqual([
      "listPets",
    ]);
  });

  it("leaves out a parameter or a path item it names, and says so", () => {
    const parsed = parseSpec(
      document({
        "/a": {
          get: {
            operationId: "getA",
            parameters: [{ $ref: "#/components/parameters/%E0%A4%A" }],
            ...answers,
          },
        },
        "/b": { $ref: "#/components/pathItems/%C3%28" },
      }),
    );

    expect(parsed.skipped.map(({ path, reason }) => [path, reason])).toEqual([
      [
        "/a",
        "parameter #/components/parameters/%E0%A4%A is not in this document, so it is left out",
      ],
      ["/b", "path item references #/components/pathItems/%C3%28, which is not in this document"],
    ]);
  });
});
