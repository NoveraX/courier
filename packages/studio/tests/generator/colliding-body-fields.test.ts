/**
 * A body whose fields share names with the endpoint's path or query
 * parameters. Gitea blocks an issue with `POST /repos/{owner}/{repo}/issues/
 * {index}/blocks`, whose body names the blocking issue by its own `owner`,
 * `repo` and `index`; creating an organisation under a user sends the
 * organisation's `username` beside the user's in the path. Merged into one
 * variables object, the parameter took each shared field's place: the field
 * was never sent, and a type asking a field to be a number and a string at
 * once kept the client from compiling. Such a body is passed under a key of
 * its own.
 */
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
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

const path = (name: string) => ({ name, in: "path", required: true, schema: { type: "string" } });
const query = (name: string) => ({ name, in: "query", schema: { type: "string" } });
const ok = {
  "200": { description: "ok", content: { "application/json": { schema: { type: "object" } } } },
};
const jsonBody = (schema: unknown) => ({
  required: true,
  content: { "application/json": { schema } },
});
const IssueMeta = {
  type: "object",
  properties: { owner: { type: "string" }, repo: { type: "string" }, index: { type: "integer" } },
};

function spec(origin: string): ParsedSpec {
  const op = (operationId: string, parameters: unknown[], requestBody: unknown) => ({
    operationId,
    tags: ["hub"],
    parameters,
    requestBody,
    responses: ok,
  });
  const blocks = [path("owner"), path("repo"), path("index")];
  const meta = jsonBody({ $ref: "#/components/schemas/IssueMeta" });
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.0",
      info: { title: "Hub", version: "1" },
      servers: [{ url: origin }],
      components: { schemas: { IssueMeta } },
      paths: {
        "/repos/{owner}/{repo}/issues/{index}/blocks": {
          post: op("blockIssue", blocks, meta),
          delete: op("unblockIssue", blocks, meta),
        },
        "/admin/users/{username}/orgs": {
          post: op(
            "createOrgForUser",
            [path("username")],
            jsonBody({
              type: "object",
              properties: { username: { type: "string" }, full_name: { type: "string" } },
            }),
          ),
        },
        "/notes/{name}": {
          post: op("writeNote", [path("name")], {
            content: {
              "application/x-www-form-urlencoded": {
                schema: {
                  type: "object",
                  properties: { name: { type: "string" }, text: { type: "string" } },
                },
              },
            },
          }),
        },
        "/tags": {
          post: op(
            "addTag",
            [query("label")],
            jsonBody({ type: "object", properties: { label: { type: "string" } } }),
          ),
        },
        "/repos/{owner}/{repo}/labels": {
          post: op(
            "createLabel",
            [path("owner"), path("repo")],
            jsonBody({
              type: "object",
              properties: { name: { type: "string" }, color: { type: "string" } },
            }),
          ),
        },
      },
    }),
  );
}

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["zod", { generateTypes: true }],
  ["valibot", { validation: "valibot", generateTypes: true }],
  ["arktype", { validation: "arktype" }],
  ["none", { validation: "none" }],
];

let upstream: UpstreamServer;

beforeAll(async () => {
  upstream = await startUpstreamServer({ done: true });
});

afterAll(async () => {
  await upstream.close();
  removeProjects("colliding-body-fields");
});

function generated(options: Partial<GenerateOptions>) {
  return generateCode(
    spec(upstream.origin),
    { type: "openapi", outputDir: "src/api", ...options },
    "hub",
  );
}

describe.each(VARIANTS)("a generated client validated with %s", (label, options) => {
  it("sends a body whose fields share a parameter's name under a key of its own", async () => {
    const { hubApi } = loadGenerated(generated(options), "src/api/hub/index.ts");
    const call = (method: string) => endpointAt(hubApi, "hub", method);
    upstream.requests.length = 0;

    await call("blockIssue")({
      owner: "go",
      repo: "tea",
      index: "3",
      body: { owner: "go", repo: "sdk", index: 7 },
    });
    await call("unblockIssue")({
      owner: "go",
      repo: "tea",
      index: "3",
      body: { owner: "go", repo: "sdk", index: 7 },
    });
    await call("createOrgForUser")({
      username: "alice",
      body: { username: "acme", full_name: "Acme" },
    });
    await call("writeNote")({ name: "todo", body: { name: "first", text: "hi" } });
    await call("addTag")({ label: "q", body: { label: "b" } });

    expect(
      upstream.requests.map((request) => [
        request.method,
        request.path,
        request.query,
        request.body,
      ]),
    ).toEqual([
      ["POST", "/repos/go/tea/issues/3/blocks", [], '{"owner":"go","repo":"sdk","index":7}'],
      ["DELETE", "/repos/go/tea/issues/3/blocks", [], '{"owner":"go","repo":"sdk","index":7}'],
      ["POST", "/admin/users/alice/orgs", [], '{"username":"acme","full_name":"Acme"}'],
      ["POST", "/notes/todo", [], "name=first&text=hi"],
      ["POST", "/tags", [["label", "q"]], '{"label":"b"}'],
    ]);
  });

  it("keeps a body that shares no name with a parameter beside the parameters", async () => {
    const { hubApi } = loadGenerated(generated(options), "src/api/hub/index.ts");
    upstream.requests.length = 0;

    await endpointAt(
      hubApi,
      "hub",
      "createLabel",
    )({ owner: "go", repo: "tea", name: "bug", color: "red" });

    expect(upstream.requests.map((request) => [request.path, request.body])).toEqual([
      ["/repos/go/tea/labels", '{"name":"bug","color":"red"}'],
    ]);
  });

  it("describes fields written inline by a type of their own, field by field", () => {
    const schemas =
      generated(options).find((file) => file.path.endsWith("hub/schemas.ts"))?.content ?? "";

    expect(schemas).toContain("export type CreateOrgForUserBody = {");
    expect(schemas).toContain("body: CreateOrgForUserBody;");
  });

  it("compiles with every unused name reported", () => {
    const dir = writeProject(`colliding-body-fields/${label}`, generated(options));
    const strictest = { ...STRICT, noUnusedLocals: true, noUnusedParameters: true };

    expect(compileProject(dir, ["src/api/hub/index.ts"], strictest)).toEqual([]);
  }, 60_000);
});
