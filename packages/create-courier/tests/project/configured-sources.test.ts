import { afterAll, describe, expect, it } from "vitest";

import { configuredSources } from "../../src/project/configured-sources";
import { readProject } from "../../src/project/read-project";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

function sourcesOf(files: Record<string, string>) {
  return configuredSources(readProject(projectWith({ "package.json": "{}", ...files })));
}

describe("configuredSources", () => {
  it("names the APIs a config declares, by key and by shorthand", () => {
    expect(
      sourcesOf({
        "courier.config.ts": `import { defineConfig } from "@noverax/courier/config";
import { site } from "./api/site";
import { catalog } from "./api/catalog";

export default defineConfig({ sources: { site, shop: catalog } });
`,
      }),
    ).toEqual({ path: "courier.config.ts", names: ["site", "shop"], more: false });
  });

  it("reads the list a config passes on from a module beside the server's code", () => {
    expect(
      sourcesOf({
        "courier.config.ts": 'export { default } from "./src/courier/config";\n',
        "src/courier/config.ts":
          "export default defineConfig({\n  sources: {\n    // the shop\n    api,\n  },\n});\n",
      }),
    ).toEqual({ path: "src/courier/config.ts", names: ["api"], more: false });
  });

  it("finds the object a config builds before it exports it, and counts a spread as more", () => {
    expect(
      sourcesOf({
        "courier.config.ts":
          "const config = defineConfig({ sources: { ...shared, api } });\nexport default config;\n",
      }),
    ).toEqual({ path: "courier.config.ts", names: ["api"], more: true });
  });

  it("counts a list built elsewhere as APIs it cannot name", () => {
    expect(
      sourcesOf({ "courier.config.ts": "export default defineConfig({ sources: allSources });\n" }),
    ).toEqual({ path: "courier.config.ts", names: [], more: true });
  });

  it("declares nothing without a config, with empty sources, or with sources in a comment", () => {
    expect(sourcesOf({})).toBeUndefined();
    expect(
      sourcesOf({ "courier.config.ts": "export default defineConfig({ sources: {} });\n" }),
    ).toBeUndefined();
    expect(
      sourcesOf({
        "courier.config.ts": "export default defineConfig({\n  // sources: { api },\n});\n",
      }),
    ).toBeUndefined();
  });
});
