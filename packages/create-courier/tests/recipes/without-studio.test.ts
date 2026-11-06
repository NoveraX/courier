/**
 * The example's mock runs with Studio, so a setup that leaves Studio out
 * leaves the mock out too, for every framework: no `courier.mocks.ts`,
 * and the example's page names only the backend to set.
 */
import { afterAll, describe, expect, it } from "vitest";

import { FRAMEWORKS } from "../../src/frameworks";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const WITH_RECIPES = FRAMEWORKS.flatMap((framework) =>
  framework.recipe === undefined ? [] : [{ ...framework, recipe: framework.recipe }],
);

function filesOf(framework: (typeof WITH_RECIPES)[number], studio: boolean) {
  const root = projectWith({
    "package.json": manifest({ [framework.marker]: "*", react: "19.2.0", vue: "3.5.0" }),
    "tsconfig.json": "{}",
  });
  return framework.recipe(contextOf(root, framework.marker, { studio })).files;
}

describe("a setup without Studio", () => {
  it.each(WITH_RECIPES.map((framework) => [framework.id, framework] as const))(
    "adds no mock for %s, and its example names only the backend",
    (_, framework) => {
      const without = filesOf(framework, false);
      const withStudio = filesOf(framework, true);
      const said = (files: typeof without) => files.map((file) => file.content).join("\n");

      expect(without.map((file) => file.path)).not.toContain("courier.mocks.ts");
      expect(said(without)).not.toContain("Start the mock");
      expect(said(without)).toMatch(/Set (VITE_|EXPO_PUBLIC_)?API_URL to your backend\./);
      expect(withStudio.map((file) => file.path)).toContain("courier.mocks.ts");
      expect(said(withStudio)).toMatch(/Start the mock with (<code>)?npm run studio/);
    },
  );
});
