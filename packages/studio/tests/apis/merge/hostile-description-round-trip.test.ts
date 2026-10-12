/**
 * An update merges a newer specification into the files an import wrote,
 * keeping what the user edited. A specification is text someone else wrote:
 * its descriptions may hold the very lines a generated file is made of —
 * `endpoints: {`, `export const X = defineGroup({` — brackets left open, a
 * comment's end, backticks and quotes. Whatever they hold, every merged file
 * parses, holds no word of them as code, keeps its exports and the user's
 * edits, and the project compiles under strict TypeScript.
 */
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../../src/apis/generator";
import type { GeneratedFile, GenerateOptions } from "../../../src/apis/generator/types";
import { generateFingerprints } from "../../../src/apis/merge/fingerprint";
import { previewUpdate } from "../../../src/apis/merge/update-flow";
import { parseSpec } from "../../../src/apis/parser";
import type { ParsedSpec } from "../../../src/apis/parser/types";
import { generatedProject } from "../../helpers/generated-project";

const MARKER = "ZZ_INJECTED";

const HOSTILE = [
  "Lists the things.",
  `    ${MARKER}: endpoint.get("zz"),`,
  "  },",
  "  endpoints: {",
  `export const ${MARKER} = defineGroup({`,
  '  prefix: "/hijacked",',
  `*/ ${MARKER}(); /*`,
  "{{{ ((( [[[ left open",
  "}}} ))) ]]] closed twice",
  `\`\${${MARKER}}\` 'single' "double" \\ backslash`,
].join("\n");

const text = (description = HOSTILE) => ({ type: "string", description });
const json = (schema: unknown) => ({ content: { "application/json": { schema } } });
const ok = (schema: unknown) => ({ "200": { description: HOSTILE, ...json(schema) } });

function spec(version: 1 | 2): ParsedSpec {
  const listed = version === 1 ? HOSTILE : `${HOSTILE}\nChanged in the second version.`;
  const model = {
    type: "object",
    description: HOSTILE,
    properties: { a: text(), ...(version === 2 ? { b: text() } : {}) },
  };
  const paths: Record<string, unknown> = {
    "/things": {
      get: {
        operationId: "listThings",
        tags: ["things"],
        summary: `{{{ ((( [[[ */ ${MARKER}`,
        description: listed,
        parameters: [
          {
            name: "q",
            in: "query",
            description: HOSTILE,
            schema: { type: "string", enum: ["{{{ ((( [[[", "}}} ))) ]]]", `*/ ${MARKER}`] },
          },
        ],
        responses: ok({ type: "object", description: HOSTILE, properties: { n: text() } }),
      },
      post: {
        operationId: "makeThing",
        tags: ["things"],
        description: HOSTILE,
        requestBody: { content: json({ type: "object", properties: { label: text() } }) },
        responses: ok({ $ref: "#/components/schemas/Model" }),
      },
    },
    "/things/{id}": {
      get: {
        operationId: "getThing",
        tags: ["things"],
        description: HOSTILE,
        parameters: [{ name: "id", in: "path", required: true, schema: text() }],
        responses: ok({ $ref: "#/components/schemas/Model" }),
      },
    },
    "/ping": { get: { operationId: "ping", description: HOSTILE, responses: ok(text()) } },
  };
  if (version === 2) {
    paths["/things/extra"] = {
      get: {
        operationId: "extraThing",
        tags: ["things"],
        description: HOSTILE,
        responses: ok(text()),
      },
    };
  }
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Hostile", version: String(version), description: HOSTILE },
      servers: [{ url: "https://hostile.example" }],
      tags: [{ name: "things", description: HOSTILE }],
      paths,
      components: { schemas: { Model: model } },
    }),
  );
}

/* What a user does to the written files before the update: edits one endpoint, adds one. */
function edited(content: string): string {
  if (!content.includes("listThings: endpoint")) return content;
  return content
    .replace(/listThings: endpoint\.get\("([^"]*)"\)/, 'listThings: endpoint.get("$1/edited")')
    .replace("  endpoints: {\n", '  endpoints: {\n    mine: endpoint.get("mine"),\n');
}

function syntaxErrors(file: { path: string; content: string }): string[] {
  const { diagnostics = [] } = ts.transpileModule(file.content, {
    fileName: file.path,
    reportDiagnostics: true,
  });
  return diagnostics.map(
    (d) => `${file.path}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`,
  );
}

/* Each identifier holding the marker: the specification's text, out of its comment or string. */
function injected(file: { path: string; content: string }): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) && node.text.includes(MARKER)) {
      found.push(`${file.path}: ${node.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true));
  return found;
}

function exportsOf(content: string): string[] {
  const source = ts.createSourceFile("module.ts", content, ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  for (const statement of source.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      names.push(...statement.exportClause.elements.map((element) => element.name.text));
    }
    const exported = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      : false;
    if (!exported) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations)
        names.push(declaration.name.getText(source));
    } else if (
      (ts.isTypeAliasDeclaration(statement) || ts.isFunctionDeclaration(statement)) &&
      statement.name
    ) {
      names.push(statement.name.text);
    }
  }
  return names.sort();
}

const project = generatedProject("hostile-description-round-trip");

afterAll(() => project.remove());

const COMBINATIONS = (["tag", "path", "single"] as const).flatMap((groupBy) =>
  (["zod", "arktype", "none"] as const).map((validation) => ({ groupBy, validation })),
);

describe("an update whose descriptions read like the code around them", () => {
  it.each(COMBINATIONS)(
    "merges cleanly, grouped by $groupBy and validated by $validation",
    (combination) => {
      const options: GenerateOptions = { type: "openapi", outputDir: "src/api", ...combination };
      const first = generateCode(spec(1), options, "hostile");
      const next = generateCode(spec(2), options, "hostile");
      const fingerprints = Object.fromEntries(
        first.flatMap((file) => Object.entries(generateFingerprints(file.content))),
      );
      const onDisk = Object.fromEntries(first.map((file) => [file.path, edited(file.content)]));

      const { files } = previewUpdate(fingerprints, next, onDisk);

      const merged = files.filter((file) => file.status === "merged");
      const editedLine = Object.values(onDisk)
        .flatMap((content) => content.split("\n"))
        .find((line) => line.includes('/edited")'));
      expect(files.filter((file) => file.status === "conflict")).toEqual([]);
      expect(merged).toHaveLength(1);
      expect(editedLine).toBeDefined();
      expect(merged[0]?.content.split("\n")).toContain(editedLine);
      expect(merged[0]?.content).toContain('    mine: endpoint.get("mine"),');
      expect(merged[0]?.content).toContain("extraThing:");
      expect(files.flatMap(syntaxErrors)).toEqual([]);
      expect(files.flatMap(injected)).toEqual([]);
      for (const file of files) {
        const generated = next.find((candidate: GeneratedFile) => candidate.path === file.path);
        expect(exportsOf(file.content), file.path).toEqual(exportsOf(generated?.content ?? ""));
      }
      const label = `${combination.groupBy}-${combination.validation}`;
      expect(project.diagnostics(label, files)).toEqual([]);
    },
    60_000,
  );
});
