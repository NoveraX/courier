/**
 * @vitest-environment node
 *
 * `/react` and `/solid` are the server's, and say so with TanStack Start's
 * own `server-only` marker. Taken by a module a page loads — a loader's,
 * which runs in the browser too — they stop the build: Vite's with Start's
 * refusal, where the adapter and the server's core would otherwise go into
 * the page unsaid, and Rsbuild's with Rspack's own, of Node's modules in a
 * page. Taken where Start keeps them from the page — what `.server(…)` is
 * given in `src/start.ts`, a `*.server.ts` module a server function calls —
 * the app builds, and its page holds nothing of the adapter. Requires a
 * build of this package and of the core first.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRsbuild } from "@rsbuild/core";
import { tanstackStart as startForRsbuild } from "@tanstack/react-start/plugin/rsbuild";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { createBuilder } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import { CALLER, type StartProject, startProject } from "./helpers/start-project";

const LIB = resolve(import.meta.dirname, "../lib");

/* A loader that calls the caller from a module of its own: the loader runs in the browser too. */
const IN_A_LOADER = {
  "src/lib/me.ts": CALLER,
  "src/routes/index.tsx": `import { createFileRoute } from "@tanstack/react-router";
import { createElement as h } from "react";
import { server } from "../lib/me";

export const Route = createFileRoute("/")({ loader: () => server.me(), component: () => h("p", null, "home") });
`,
};

/* The caller in a `*.server.ts` module a server function calls, and the request's session from `src/start.ts`. */
const WHERE_START_KEEPS_IT = {
  "src/lib/me.server.ts": CALLER,
  "src/lib/me.ts": `import { createServerFn } from "@tanstack/react-start";
import { server } from "./me.server";

export const getMe = createServerFn().handler(() => server.me());
`,
  "src/start.ts": `import { requestContext } from "@noverax/courier-tanstack-start/react";
import { createMiddleware, createStart } from "@tanstack/react-start";

export const startInstance = createStart(() => ({ requestMiddleware: [createMiddleware().server(requestContext())] }));
`,
  "src/routes/index.tsx": `import { createFileRoute } from "@tanstack/react-router";
import { createElement as h } from "react";
import { getMe } from "../lib/me";

export const Route = createFileRoute("/")({ loader: () => getMe(), component: () => h("p", null, "home") });
`,
};

async function viteBuild(root: string): Promise<void> {
  const builder = await createBuilder({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [tanstackStart()],
  });
  await builder.buildApp();
}

async function rsbuildBuild(root: string): Promise<void> {
  const rsbuild = await createRsbuild({
    cwd: root,
    loadEnv: false,
    rsbuildConfig: { logLevel: "silent", plugins: [startForRsbuild()] },
  });
  await rsbuild.build();
}

let app: StartProject | undefined;

afterEach(() => {
  app?.remove();
  app = undefined;
});

describe("the server's entries, in an app's build", () => {
  /* Where among its imports makes no difference: Start reads each, and the build puts the chunk the entries share first. */
  it("import TanStack Start's server-only marker, each its own framework's", () => {
    for (const framework of ["react", "solid"]) {
      const code = readFileSync(join(LIB, `${framework}.js`), "utf8");

      expect(code).toMatch(new RegExp(`^import "@tanstack/${framework}-start/server-only";$`, "m"));
    }
  });

  it("stop a Vite build whose page module takes /react, with TanStack Start's refusal", async () => {
    app = startProject(IN_A_LOADER);

    await expect(viteBuild(app.root)).rejects.toThrow(
      /Denied by marker[\s\S]*@noverax\/courier-tanstack-start\/lib\/react\.js/,
    );
  }, 60_000);

  it("stop an Rsbuild build of the same app", async () => {
    app = startProject(IN_A_LOADER);

    await expect(rsbuildBuild(app.root)).rejects.toThrow();
  }, 60_000);

  it.each([
    ["Vite", viteBuild],
    ["Rsbuild", rsbuildBuild],
  ])(
    "build with %s where TanStack Start keeps them from the page, which holds none of them",
    async (_, build) => {
      app = startProject(WHERE_START_KEEPS_IT);

      await build(app.root);

      expect(app.takesAdapter("dist/server")).toBe(true);
      expect(app.takesAdapter("dist/client")).toBe(false);
    },
    60_000,
  );
});
