import { afterAll, describe, expect, it } from "vitest";

import { buildPlan } from "../../src/plan/build-plan";
import { honoRecipe } from "../../src/recipes/hono";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const INDEX = `import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

serve({ fetch: app.fetch, port: 3000 })
`;
const TSCONFIG = `{
  "compilerOptions": {
    "module": "NodeNext",
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "exclude": ["node_modules"]
}
`;

describe("honoRecipe", () => {
  it("mounts Courier's routes right after the app is made, in its style, and compiles src/ alone", () => {
    const root = projectWith({
      "package.json": manifest({ hono: "^4.13.13" }, { type: "module" }),
      "tsconfig.json": TSCONFIG,
      "src/index.ts": INDEX,
    });
    const ctx = contextOf(root, "hono");
    const edits = new Map(
      buildPlan(ctx, honoRecipe(ctx)).edits.map((edit) => [edit.path, edit.after]),
    );

    expect(edits.get("src/index.ts")).toContain(
      "import { Hono } from 'hono'\nimport { courier } from './courier/routes.js'\n\nconst app = new Hono()\napp.route('/', courier)\n\napp.get(",
    );
    expect(edits.get("tsconfig.json")).toContain(
      '"exclude": ["node_modules"],\n  "include": ["src"]\n}',
    );
  });

  it("writes the server's modules with the extension Node's resolution asks for", () => {
    const root = projectWith({
      "package.json": manifest({ hono: "^4.13.13" }),
      "tsconfig.json": TSCONFIG,
    });
    const routes = honoRecipe(contextOf(root, "hono")).files.find(
      (file) => file.path === "src/courier/routes.ts",
    );

    expect(routes?.content).toContain('import { sources } from "./sources.js";');
    expect(routes?.content).toContain('courier.all("/api/request", courierHandler());');
  });
});
