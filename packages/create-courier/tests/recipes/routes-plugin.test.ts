import { afterAll, describe, expect, it } from "vitest";

import { readProject } from "../../src/project/read-project";
import {
  astroRoutesEdit,
  nuxtRoutesEdit,
  viteRoutesEdit,
} from "../../src/recipes/edits/routes-plugin";
import { manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

function projectOf(files: Record<string, string>) {
  return readProject(projectWith({ "package.json": manifest({}), ...files }));
}

describe("viteRoutesEdit", () => {
  const VITE =
    "import { sveltekit } from '@sveltejs/kit/vite';\nimport { defineConfig } from 'vite';\n\nexport default defineConfig({\n\tplugins: [sveltekit()]\n});\n";

  it("adds the framework's courierRoutes() to Vite's plugins, imported in the file's style", () => {
    const project = projectOf({ "vite.config.ts": VITE });
    const edit = viteRoutesEdit(project, "@noverax/courier-sveltekit/plugin");

    expect(edit.path).toBe("vite.config.ts");
    expect(edit.change(VITE)).toBe(
      "import { sveltekit } from '@sveltejs/kit/vite';\nimport { defineConfig } from 'vite';\nimport { courierRoutes } from '@noverax/courier-sveltekit/plugin';\n\nexport default defineConfig({\n\tplugins: [sveltekit(), courierRoutes()]\n});\n",
    );
  });

  it("counts the plugin a config calls from the engine's own entry as there already", () => {
    const text =
      'import { courierRoutes } from "@noverax/courier-build/vite";\n\nexport default defineConfig({ plugins: [courierRoutes()] });\n';
    const edit = viteRoutesEdit(
      projectOf({ "vite.config.ts": text }),
      "@noverax/courier-remix/plugin",
    );

    expect(edit.change(text)).toBe(text);
  });

  it("names the plugin's lines where the config is not one the edit knows", () => {
    const text = "export default async () => ({ plugins: [] });\n";
    const edit = viteRoutesEdit(
      projectOf({ "vite.config.js": text }),
      "@noverax/courier-solid/plugin",
    );

    expect(edit.path).toBe("vite.config.js");
    expect(edit.change(text)).toBeUndefined();
    expect(edit.manual).toEqual({
      file: "vite.config.js",
      what: "Build the pages' routes in: add courierRoutes() to the config's plugins",
      lines: [
        'import { courierRoutes } from "@noverax/courier-solid/plugin";',
        "plugins: [courierRoutes()],",
      ],
    });
  });
});

describe("astroRoutesEdit", () => {
  it("adds Courier's integration to Astro's integrations", () => {
    const text =
      "import { defineConfig } from 'astro/config';\n\nexport default defineConfig({});\n";
    const edit = astroRoutesEdit(projectOf({ "astro.config.mjs": text }));

    expect(edit.change(text)).toBe(
      "import { defineConfig } from 'astro/config';\nimport { courierRoutesIntegration } from '@noverax/courier-astro/plugin';\n\nexport default defineConfig({\n  integrations: [courierRoutesIntegration()],\n});\n",
    );
  });
});

describe("nuxtRoutesEdit", () => {
  it("adds Courier's module to Nuxt's modules, by its name", () => {
    const text = "export default defineNuxtConfig({\n  modules: ['@nuxt/eslint'],\n})\n";
    const edit = nuxtRoutesEdit(projectOf({ "nuxt.config.ts": text }));

    expect(edit.change(text)).toBe(
      "import { courierRoutesModule } from '@noverax/courier-nuxt/plugin'\n\nexport default defineNuxtConfig({\n  modules: ['@nuxt/eslint', courierRoutesModule],\n})\n",
    );
  });
});
