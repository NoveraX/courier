/**
 * How a schema's nullability survives conversion, checked on what the
 * generator writes: the client is called against a real server, and the
 * types are compiled.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../../src/apis/generator";
import { generateCode } from "../../../src/apis/generator";
import { parseSpec } from "../../../src/apis/parser";
import { generatedCall, loadGenerated } from "../../helpers/load-generated";
import { type RecordingServer, startRecordingServer } from "../../helpers/recording-server";

const VALIDATORS = ["zod", "valibot", "arktype"] as const;

/* Inside the repository's node_modules, so the libraries resolve the way
   they do from a user's project. */
const ROOT = fileURLToPath(
  new URL("../../../../../node_modules/.cache/courier-nullable-schemas/", import.meta.url),
);

const ALL_NULL = { addr: null, name: null, mixed: null, level: null, count: null, tree: null };

let server: RecordingServer;
let answer: unknown = ALL_NULL;

beforeAll(async () => {
  server = await startRecordingServer(() => ({
    contentType: "application/json",
    body: JSON.stringify(answer),
  }));
});

afterAll(async () => {
  await server.close();
  rmSync(ROOT, { recursive: true, force: true });
});

/** GitHub's `nullable-simple-user` pattern, in each form a schema says it. */
function spec(): string {
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Nul", version: "1" },
    servers: [{ url: server.url }],
    paths: {
      "/holder": {
        get: {
          tags: ["holders"],
          operationId: "getHolder",
          responses: {
            "200": { description: "ok", content: { "application/json": { schema: ref("Holder") } } },
          },
        },
      },
    },
    components: {
      schemas: {
        MaybeAddress: { type: "object", nullable: true, properties: { city: { type: "string" } } },
        MaybeName: { type: "string", nullable: true },
        Mixed: { enum: ["a", 1, true, null], nullable: true },
        Level: { type: "string", enum: ["low", "high", null] },
        MaybeCount: { type: ["integer", "null"] },
        TreeNode: {
          type: "object",
          nullable: true,
          required: ["id", "parent"],
          properties: { id: { type: "string" }, parent: ref("TreeNode") },
        },
        Holder: {
          type: "object",
          required: ["addr", "name", "mixed", "level", "count", "tree"],
          properties: {
            addr: ref("MaybeAddress"),
            name: ref("MaybeName"),
            mixed: ref("Mixed"),
            level: ref("Level"),
            count: ref("MaybeCount"),
            tree: ref("TreeNode"),
          },
        },
      },
    },
  });
}

function generate(options: Partial<GenerateOptions>) {
  return generateCode(parseSpec(spec()), { type: "openapi", outputDir: "src", ...options }, "nullables");
}

describe.each(VALIDATORS)("a nullable component (%s)", (validation) => {
  const getHolder = () =>
    generatedCall(loadGenerated(generate({ validation }), "src/nullables/index.ts"), [
      "nullablesApi",
      "holders",
      "getHolder",
    ])();

  it("accepts null wherever it is referenced", async () => {
    answer = ALL_NULL;

    await expect(getHolder()).resolves.toEqual(ALL_NULL);
  });

  it("follows a nullable schema that refers to itself", async () => {
    answer = { ...ALL_NULL, tree: { id: "leaf", parent: { id: "root", parent: null } } };
    await expect(getHolder()).resolves.toEqual(answer);

    answer = { ...ALL_NULL, tree: { id: "leaf", parent: { id: 7, parent: null } } };
    await expect(getHolder()).rejects.toThrow(/Validation failed/);
  });

  it("still checks a value that is not null", async () => {
    answer = { ...ALL_NULL, addr: { city: 5 } };

    await expect(getHolder()).rejects.toThrow(/Validation failed/);
  });
});

function diagnostics(label: string, options: Partial<GenerateOptions>): string[] {
  const dir = join(ROOT, label);
  for (const file of generate(options)) {
    const path = join(dir, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content);
  }
  const check = join(dir, "check.ts");
  writeFileSync(
    check,
    [
      'import type { Holder } from "./src/nullables/index";',
      `export const holder: Holder = ${JSON.stringify(ALL_NULL)};`,
    ].join("\n"),
  );
  const program = ts.createProgram([check], {
    strict: true,
    noEmit: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    types: [],
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

describe("the generated types", () => {
  it.each([...VALIDATORS, "none"] as const)("let a holder of nulls compile (%s)", (validation) => {
    expect(diagnostics(validation, { validation })).toEqual([]);
  });

  it("let a holder of nulls compile without schemas", () => {
    expect(diagnostics("types-only", { validation: "zod", generateSchemas: false })).toEqual([]);
  });
});
