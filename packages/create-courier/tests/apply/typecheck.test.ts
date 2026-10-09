/**
 * The check of what the setup touched, with the TypeScript the project
 * installed: here the repository's, linked into each project.
 */
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { typecheckTouched } from "../../src/apply/typecheck";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

const TYPESCRIPT = fileURLToPath(new URL("../../../../node_modules/typescript", import.meta.url));
const STRICT =
  '{ "compilerOptions": { "strict": true, "noEmit": true, "module": "esnext", "moduleResolution": "bundler", "target": "es2022" } }';

function withTypescript(files: Record<string, string>): string {
  const root = projectWith({ "package.json": "{}", ...files });
  mkdirSync(join(root, "node_modules"), { recursive: true });
  symlinkSync(TYPESCRIPT, join(root, "node_modules/typescript"), "dir");
  return root;
}

const none = new Map<string, Set<number>>();

describe("typecheckTouched", () => {
  it("reports an error in a file the setup added, and nothing in the project's own", async () => {
    const root = withTypescript({
      "tsconfig.json": STRICT,
      "src/added.ts": "export const count: number = 'one';\n",
      "src/theirs.ts": "export const name: string = 1;\n",
    });

    const outcome = await typecheckTouched(root, { added: ["src/added.ts"], changed: none });

    expect(outcome.kind).toBe("errors");
    expect(outcome.kind === "errors" ? outcome.lines.join("\n") : "").toContain(
      "src/added.ts(1,14)",
    );
    expect(outcome.kind === "errors" ? outcome.lines.join("\n") : "").not.toContain("theirs");
  }, 60_000);

  it("checks each project a solution tsconfig references, and a root file none includes", async () => {
    const root = withTypescript({
      "tsconfig.json": '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }',
      "tsconfig.app.json":
        '{ "compilerOptions": { "strict": true, "noEmit": true, "moduleResolution": "bundler", "module": "esnext" }, "include": ["src"] }',
      "src/added.ts": "export const ok = 1;\n",
      "courier.config.ts": "export const port: number = 'x';\n",
    });

    const outcome = await typecheckTouched(root, {
      added: ["src/added.ts", "courier.config.ts"],
      changed: none,
    });

    expect(outcome.kind === "errors" ? outcome.lines.join("\n") : outcome.kind).toContain(
      "courier.config.ts(1,14)",
    );
  }, 60_000);

  it("holds a file the setup changed to the lines it changed", async () => {
    const root = withTypescript({
      "tsconfig.json": STRICT,
      "src/edited.ts": "export const before: number = 'old';\nexport const after = 1;\n",
    });

    const untouched = await typecheckTouched(root, {
      added: [],
      changed: new Map([["src/edited.ts", new Set([2])]]),
    });
    const touched = await typecheckTouched(root, {
      added: [],
      changed: new Map([["src/edited.ts", new Set([1])]]),
    });

    expect(untouched.kind).toBe("clean");
    expect(touched.kind).toBe("errors");
  }, 60_000);

  it("says so where the project has no TypeScript", async () => {
    const root = projectWith({ "package.json": "{}", "tsconfig.json": STRICT });

    expect(await typecheckTouched(root, { added: ["a.ts"], changed: none })).toEqual({
      kind: "no-typescript",
    });
  });
});
