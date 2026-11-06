import { afterAll, describe, expect, it } from "vitest";

import { addCourier } from "../src/add-courier";
import type { Recipe } from "../src/recipes/recipe-types";
import { jsonReport } from "../src/report/json-report";
import { withSecretImport } from "../src/secret-import";
import { contextOf, manifest, projectWith, removeProjects } from "./recipes/project-fixture";

afterAll(removeProjects);

/* Made up for the test. */
const KEY = "k3y-made-up-9f2c00aa11bb";
const SECRET_URL = `https://specs.example/pets.json?api_key=${KEY}`;
const read = (name: string) => `\${process.env.${name}}`;

const NOTHING: Recipe = {
  files: [],
  edits: [],
  dependencies: [],
  devDependencies: [],
  scripts: {},
  manual: [],
  next: [],
};

describe("an import of an address with a secret", () => {
  it("leaves the person the entry Studio declares nowhere, its from reading the secret from a variable", () => {
    const ctx = contextOf(projectWith({ "package.json": manifest({ hono: "4.10.0" }) }), "hono", {
      example: false,
      openapi: SECRET_URL,
      name: "pets",
    });

    const recipe = withSecretImport(ctx, {
      ...NOTHING,
      files: [{ path: "src/courier/config.ts", content: "", purpose: "lists your APIs" }],
    });

    expect(recipe.manual).toEqual([
      {
        file: "src/courier/config.ts",
        what: "Studio writes the import's code and declares it nowhere, as its address carries a secret this file would keep in your repository: add the entry Studio prints, its from as below, and set PETS_SPEC_API_KEY in .env.local or the environment Studio runs in",
        lines: [`from: \`https://specs.example/pets.json?api_key=${read("PETS_SPEC_API_KEY")}\`,`],
      },
    ]);
  });

  it("leaves nothing for a file, or an address without a secret", () => {
    const root = projectWith({ "package.json": manifest({ hono: "4.10.0" }) });

    for (const openapi of ["./openapi.json", "https://specs.example/pets.json?page=2"])
      expect(withSecretImport(contextOf(root, "hono", { example: false, openapi }), NOTHING)).toBe(
        NOTHING,
      );
  });

  it("names the step in the JSON document's plan, the address without its secret", async () => {
    const root = projectWith({
      "package.json": manifest({ next: "16.4.0", react: "19.2.0", "react-dom": "19.2.0" }),
      "tsconfig.json": "{}",
      "next.config.ts": "export default {};\n",
    });
    const report = jsonReport("create-courier", "0.5.0");

    const status = await addCourier(
      root,
      { "dry-run": true, openapi: SECRET_URL },
      { questions: undefined, report, toolOutput: "stderr" },
    );

    const document = report.document(status);
    expect(status).toBe(0);
    expect(JSON.parse(document).plan.manual).toContainEqual(
      expect.objectContaining({
        file: "courier.config.ts",
        lines: [`from: \`https://specs.example/pets.json?api_key=${read("SPEC_API_KEY")}\`,`],
      }),
    );
    expect(document).not.toContain(KEY);
  });
});
