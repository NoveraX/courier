/** A config under another of the names Studio reads: the project's config, with no courier.config.ts beside it. */
import { afterAll, describe, expect, it } from "vitest";

import { manifestWith, planAt } from "./configured-fixture";
import { projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

describe("a config under another of its names", () => {
  const files = (config: string) => ({
    "package.json": manifestWith({ next: "16.4.0", react: "19.2.0" }),
    "tsconfig.json": "{}",
    "next.config.ts": "export default {};\n",
    "courier.config.mjs": config,
  });

  it("counts as the project's config, and no courier.config.ts is added beside it", () => {
    const configured = planAt(
      projectWith(
        files(
          'import { defineConfig } from "@noverax/courier/config";\nimport { shop } from "./api/shop.mjs";\n\nexport default defineConfig({ sources: { shop } });\n',
        ),
      ),
      "next",
      "next",
    );

    expect(configured.files.map((file) => file.path)).not.toContain("courier.config.ts");
    expect(configured.files.map((file) => file.path)).toContain("courier.config.mjs");
    expect(configured.files.map((file) => file.path)).not.toContain("courier/api.ts");
    expect(configured.files.find((file) => file.path === "instrumentation.ts")?.content).toContain(
      'await import("./courier.config.mjs")',
    );
  });

  it("with no API declared yet, gets the example, still without a courier.config.ts beside it", () => {
    const plan = planAt(projectWith(files("export default { sources: {} };\n")), "next", "next");

    expect(plan.files.map((file) => file.path)).toContain("courier/api.ts");
    expect(plan.files.map((file) => file.path)).not.toContain("courier.config.ts");
    expect(plan.files.find((file) => file.path === "courier.config.mjs")?.state).toBe("kept");
  });
});
