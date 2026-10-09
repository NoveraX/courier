import { describe, expect, it } from "vitest";

import { namedImport } from "../../src/edit/code-style";
import { addToConfigList, type ConfigListItem } from "../../src/edit/config-list";

const plugin = (entry: string): ConfigListItem => ({
  callees: ["defineConfig"],
  property: "plugins",
  item: () => "courierStudio()",
  importLine: (style) => namedImport(style, ["courierStudio"], `@noverax/courier-studio/${entry}`),
});

const VITE_REACT = `import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
`;

const SVELTEKIT = `import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
\tplugins: [
\t\tsveltekit({
\t\t\tcompilerOptions: {
\t\t\t\t// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
\t\t\t\truneS: ({ filename }) =>
\t\t\t\t\tfilename.split(/[/\\\\]/).includes('node_modules') ? undefined : true
\t\t\t},

\t\t\t// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
\t\t\tadapter: adapter()
\t\t})
\t]
});
`;

const REACT_ROUTER = `import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
});
`;

const ASTRO = `// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({});
`;

const NUXT = `// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true }
})
`;

describe("addToConfigList", () => {
  it("adds the plugin to Vite's one-line list, in the file's quotes and without semicolons", () => {
    expect(
      addToConfigList(VITE_REACT, plugin("react")),
    ).toBe(`import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { courierStudio } from '@noverax/courier-studio/react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), courierStudio()],
})
`);
  });

  it("adds the plugin on a line of its own after SvelteKit's, past a regular expression with brackets", () => {
    const changed = addToConfigList(SVELTEKIT, plugin("sveltekit"));

    expect(changed).toContain("\t\t\tadapter: adapter()\n\t\t}),\n\t\tcourierStudio()\n\t]\n});");
    expect(changed).toContain(
      "import { defineConfig } from 'vite';\nimport { courierStudio } from '@noverax/courier-studio/sveltekit';\n",
    );
  });

  it("adds the plugin after the last of several, keeping the other keys", () => {
    const changed = addToConfigList(REACT_ROUTER, plugin("remix"));

    expect(changed).toContain(
      "plugins: [tailwindcss(), reactRouter(), courierStudio()],\n  resolve: {",
    );
    expect(changed).toContain(
      'import { courierStudio } from "@noverax/courier-studio/remix";\n\nexport default',
    );
  });

  it("adds the list to a config without one, below a leading comment", () => {
    const integration: ConfigListItem = {
      callees: ["defineConfig"],
      property: "integrations",
      item: () => "courierStudio()",
      importLine: (style) => namedImport(style, ["courierStudio"], "@noverax/courier-studio/astro"),
    };

    expect(addToConfigList(ASTRO, integration)).toBe(`// @ts-check
import { defineConfig } from 'astro/config';
import { courierStudio } from '@noverax/courier-studio/astro';

// https://astro.build/config
export default defineConfig({
  integrations: [courierStudio()],
});
`);
  });

  it("adds a key after the last one of a config that imports nothing, in its quotes", () => {
    const module: ConfigListItem = {
      callees: ["defineNuxtConfig"],
      property: "modules",
      item: () => "courierStudioModule",
      importLine: (style) =>
        namedImport(style, ["courierStudioModule"], "@noverax/courier-studio/nuxt"),
    };

    expect(
      addToConfigList(NUXT, module),
    ).toBe(`// https://nuxt.com/docs/api/configuration/nuxt-config
import { courierStudioModule } from '@noverax/courier-studio/nuxt'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [courierStudioModule]
})
`);
  });

  it("refuses a config it cannot read: no literal exported, two exports, a list built in code", () => {
    expect(addToConfigList("export default makeConfig()\n", plugin("react"))).toBeUndefined();
    expect(
      addToConfigList("export default defineConfig({})\nexport default {}\n", plugin("react")),
    ).toBeUndefined();
    expect(
      addToConfigList("export default defineConfig({ plugins: base.plugins })\n", plugin("react")),
    ).toBeUndefined();
  });

  it("refuses a file whose brackets do not pair up", () => {
    expect(
      addToConfigList("export default defineConfig({ plugins: [react() })\n", plugin("react")),
    ).toBeUndefined();
  });
});
