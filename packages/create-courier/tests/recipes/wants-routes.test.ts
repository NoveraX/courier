import { afterAll, describe, expect, it } from "vitest";

import { wantsRoutes } from "../../src/recipes/shared/wants-routes";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

/* A Next.js app whose config declares one API already, defined in this module. */
function setUpWith(api: string) {
  return contextOf(
    projectWith({
      "package.json": manifest({ next: "16.4.0", react: "19.2.0" }),
      "tsconfig.json": "{}",
      "courier.config.ts":
        'import { shop } from "./api/shop";\n\nexport default defineConfig({ sources: { shop } });\n',
      "api/shop.ts": api,
    }),
    "next",
  );
}

describe("wantsRoutes", () => {
  it("counts an endpoint marked with .expose() in a project set up already", () => {
    const ctx = setUpWith(
      'export const shop = defineApi({ groups: { items: defineGroup({ endpoints: { list: endpoint.get("").expose() } }) } });\n',
    );

    expect(wantsRoutes(ctx)).toBe(true);
  });

  it("counts an API or a group that opens its endpoints with expose: true", () => {
    const api = setUpWith("export const shop = defineApi({ expose: true, groups: {} });\n");
    const group = setUpWith(
      "export const shop = defineApi({ groups: { items: defineGroup({ expose: true, endpoints: {} }) } });\n",
    );

    expect(wantsRoutes(api)).toBe(true);
    expect(wantsRoutes(group)).toBe(true);
  });

  it("leaves out a project set up already whose code opens no endpoint", () => {
    const ctx = setUpWith("export const shop = defineApi({ expose: false, groups: {} });\n");

    expect(wantsRoutes(ctx)).toBe(false);
  });
});
