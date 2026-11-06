import { afterAll, describe, expect, it } from "vitest";

import { importSpecification } from "../../src/apply/import-specification";
import { SetupFailure } from "../../src/apply/setup-failure";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

/* A project whose Studio's import is a script of the test's own. */
function projectWithImport(script: string): string {
  return projectWith({
    "package.json": "{}",
    "node_modules/@noverax/courier-studio/package.json": JSON.stringify({
      name: "@noverax/courier-studio",
      version: "0.0.0",
    }),
    "node_modules/@noverax/courier-studio/lib/cli.js": script,
  });
}

const SPEC = "https://api.example.com/openapi.json";

describe("importSpecification", () => {
  it("says what to do where the server asked for credentials, which the setup sends none of", async () => {
    const root = projectWithImport(
      `process.stderr.write("${SPEC} answered 401.\\n"); process.exitCode = 1;`,
    );

    const failed = await importSpecification(root, SPEC, undefined, undefined, "stderr").catch(
      (caught: unknown) => caught,
    );

    expect(failed).toBeInstanceOf(SetupFailure);
    expect(failed).toMatchObject({ code: "IMPORT_FAILED" });
    expect(String((failed as Error).message)).toBe(
      `Studio's import: courier-studio import ${SPEC} failed (exit 1); the server asked for credentials, which the setup sends none of: download the specification, and import its file`,
    );
  });

  it("names no credentials where the import failed otherwise, and none where it went through", async () => {
    const failing = projectWithImport(
      `process.stderr.write("${SPEC} answered 500.\\n"); process.exitCode = 1;`,
    );
    const passing = projectWithImport(`process.stdout.write("Imported 3 endpoints.\\n");`);

    await expect(
      importSpecification(failing, SPEC, undefined, undefined, "stderr"),
    ).rejects.toThrow(/^Studio's import: courier-studio import \S+ failed \(exit 1\)$/);
    await expect(
      importSpecification(passing, SPEC, undefined, undefined, "stderr"),
    ).resolves.toBeUndefined();
  });
});
