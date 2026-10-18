/**
 * Generated code holds no text from its specification that would end a
 * page's `<script>`, or a line where an older parser reads one: every value
 * a specification gives that the generator writes as a string — a path, a
 * media type, a base URL, the name of a query parameter, a form field or a
 * header, an enum's member, a description — is written with `<`, `>` and the
 * two line separators escaped, and each escape reads back as the value
 * itself. A description written as prose in a comment has its `</script`
 * and `<!--` broken.
 *
 * A pattern is written as the specification gives it, its source kept —
 * Studio reads a validator's pattern back by it — so a `</` inside its
 * character class stays as written; this specification holds none.
 */
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GeneratedFile, GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { endpointAt, loadGenerated } from "../helpers/generated-project";
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

const SCRIPT_END = "</script>";
const QUERY = `q${SCRIPT_END}\u2028`;
const FIELD = "tag<b>";
const MEDIA = `application/vnd.x+json; p="${SCRIPT_END}"`;
const PROSE = `<p>List &amp; <code>more</code></p>${SCRIPT_END} <!-- hidden -->`;
const SORTS = [`price${SCRIPT_END}`, "name<!--"];

const ok = {
  "200": { description: "ok", content: { "application/json": { schema: { type: "object" } } } },
};

function spec(origin: string): string {
  return JSON.stringify({
    openapi: "3.0.0",
    info: { title: "Shop", version: "1" },
    servers: [{ url: origin }],
    security: [{ key: [] }],
    components: {
      securitySchemes: { key: { type: "apiKey", in: "header", name: `X-Key${SCRIPT_END}` } },
    },
    paths: {
      [`/find${SCRIPT_END}/{id}`]: {
        get: {
          operationId: "find",
          tags: ["items"],
          description: PROSE,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: QUERY, in: "query", schema: { type: "string" } },
            { name: "sort", in: "query", schema: { type: "string", enum: SORTS } },
            { name: `X-H${SCRIPT_END}`, in: "header", schema: { type: "string" } },
          ],
          responses: ok,
        },
      },
      [`/up${SCRIPT_END}`]: {
        post: {
          operationId: "upload",
          tags: ["items"],
          parameters: [{ name: FIELD, in: "query", schema: { type: "string" } }],
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: { type: "object", properties: { note: { type: "string" } } },
              },
            },
          },
          responses: ok,
        },
      },
      [`/del${SCRIPT_END}/{id}`]: {
        delete: {
          operationId: "remove",
          tags: ["items"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: { type: "object", properties: { reason: { type: "string" } } },
              },
            },
          },
          responses: ok,
        },
      },
      "/bulk": {
        post: {
          operationId: "bulk",
          tags: ["items"],
          requestBody: {
            required: true,
            content: { [MEDIA]: { schema: { type: "array", items: { type: "string" } } } },
          },
          responses: ok,
        },
      },
      [`/report${SCRIPT_END}`]: {
        get: {
          operationId: "report",
          tags: ["items"],
          responses: { "200": { description: "ok", content: { "text/csv": {} } } },
        },
      },
      [`/feed${SCRIPT_END}\u2029`]: {
        get: {
          operationId: "feed",
          tags: ["items"],
          parameters: [
            {
              name: "f",
              in: "query",
              style: "deepObject",
              explode: true,
              schema: { type: "object" },
            },
          ],
          responses: { "200": { description: "ok", content: { "text/event-stream": {} } } },
        },
      },
    },
  });
}

/* The source outside its comments. */
function codeOf(file: GeneratedFile): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    file.content,
  );
  let code = "";
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const comment =
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia;
    if (!comment) code += scanner.getTokenText();
  }
  return code;
}

/* The code's strings, each as it reads once its escapes are decoded. */
function stringsOf(file: GeneratedFile): string[] {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    file.content,
  );
  const values: string[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.StringLiteral) values.push(scanner.getTokenValue());
  }
  return values;
}

function parseErrors(file: GeneratedFile): number {
  const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
  return (source as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics.length;
}

const VALIDATIONS: GenerateOptions["validation"][] = ["zod", "valibot", "arktype", "none"];

describe.each(VALIDATIONS)("code generated with %s validation", (validation) => {
  const files = generateCode(
    parseSpec(spec(`https://shop.example/v1${SCRIPT_END}`)),
    { type: "openapi", outputDir: "src/api", validation, addAuthMiddleware: true },
    "shop",
  );

  it("parses, file by file", () => {
    expect(files.map((file) => [file.path, parseErrors(file)])).toEqual(
      files.map((file) => [file.path, 0]),
    );
  });

  it("holds nothing that would end or upset a script, comments included", () => {
    for (const file of files) expect(file.content).not.toMatch(/<\/script|<!--/i);
  });

  it("holds no line separator and no markup of the specification outside its comments", () => {
    for (const file of files) {
      const code = codeOf(file);

      expect(code).not.toMatch(/\u2028|\u2029/);
      expect(code).not.toContain("<b>");
    }
  });

  it("writes each value as a string that reads back as the specification gives it", () => {
    const strings = new Set(files.flatMap(stringsOf));

    for (const value of [
      ...SORTS,
      MEDIA,
      `X-Key${SCRIPT_END}`,
      `https://shop.example/v1${SCRIPT_END}`,
    ]) {
      expect(strings).toContain(value);
    }
  });
});

describe("a call of the generated client", () => {
  let upstream: UpstreamServer;

  beforeAll(async () => {
    upstream = await startUpstreamServer({ ok: true });
  });

  afterAll(async () => {
    await upstream.close();
  });

  function call(method: string): (variables?: unknown) => Promise<unknown> {
    const files = generateCode(
      parseSpec(spec(upstream.origin)),
      { type: "openapi", outputDir: "src/api", validation: "none" },
      "shop",
    );
    const { shopApi } = loadGenerated(files, "src/api/shop/index.ts");
    return endpointAt(shopApi, "items", method);
  }

  async function sent(made: Promise<unknown>) {
    upstream.requests.length = 0;
    await made;
    const [request] = upstream.requests;
    return request;
  }

  it("sends the path and the query parameter's name the specification gives", async () => {
    const request = await sent(call("find")({ id: "7", [QUERY]: "x" }));

    expect(request?.path).toBe(new URL(`https://shop.example/find${SCRIPT_END}/7`).pathname);
    expect(request?.query).toEqual([[QUERY, "x"]]);
  });

  it("sends a form's fields apart from the query parameter it names", async () => {
    const form = new FormData();
    form.append(FIELD, "t");
    form.append("note", "n");
    const request = await sent(call("upload")(form));

    expect(request?.path).toBe(new URL(`https://shop.example/up${SCRIPT_END}`).pathname);
    expect(request?.query).toEqual([[FIELD, "t"]]);
    expect(request?.body).toContain('name="note"');
    expect(request?.body).not.toContain(`name="${FIELD}"`);
  });

  it("sends a body with the media type the specification gives", async () => {
    const request = await sent(call("bulk")(["a"]));

    expect(request?.contentType).toBe(MEDIA);
    expect(JSON.parse(request?.body ?? "null")).toEqual(["a"]);
  });

  it("reads an answer of another kind at the path the specification gives", async () => {
    const request = await sent(call("report")());

    expect(request?.path).toBe(new URL(`https://shop.example/report${SCRIPT_END}`).pathname);
  });
});
