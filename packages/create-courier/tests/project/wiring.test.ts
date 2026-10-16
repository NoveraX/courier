import { afterAll, describe, expect, it } from "vitest";

import { readProject } from "../../src/project/read-project";
import {
  attachesStudio,
  fileUsing,
  registeringFile,
  studioServerFile,
} from "../../src/project/wiring";
import { projectWith, removeProjects } from "../recipes/project-fixture";

afterAll(removeProjects);

const CONFIG = "export default defineConfig({ sources: { api } });\n";

function projectOf(files: Record<string, string>, dependencies: Record<string, string> = {}) {
  return readProject(
    projectWith({
      "package.json": JSON.stringify({ dependencies }),
      "courier.config.ts": CONFIG,
      ...files,
    }),
  );
}

describe("registeringFile", () => {
  it("finds the config's sources registered from a static or a dynamic import of the config", () => {
    const dynamic = projectOf(
      {
        "instrumentation.ts": `import { registerSources } from "@noverax/courier";
export async function register() {
  const { default: config } = await import("./courier.config");
  registerSources(config.sources);
}
`,
      },
      { next: "16.4.0" },
    );
    const aliased = projectOf(
      {
        "src/hooks.server.ts": `import * as courier from "@noverax/courier";
import settings from "@/courier.config";
const { sources } = settings;
courier.registerSources(sources);
`,
      },
      { "@sveltejs/kit": "^2.40.0" },
    );

    expect(registeringFile(dynamic)).toBe("instrumentation.ts");
    expect(registeringFile(aliased)).toBe("src/hooks.server.ts");
  });

  it("follows the config to the module it passes its list on from", () => {
    const project = readProject(
      projectWith({
        "package.json": "{}",
        "courier.config.ts": 'export { default } from "./src/courier/config";\n',
        "src/courier/config.ts": CONFIG,
        "src/server.ts":
          'import { registerSources } from "@noverax/courier";\nimport config from "./courier/config.js";\nregisterSources(config.sources);\n',
      }),
    );

    expect(registeringFile(project)).toBe("src/server.ts");
  });

  it("finds none where the call is in a comment, or is given other sources", () => {
    const commented = projectOf({
      "instrumentation.ts":
        'import { registerSources } from "@noverax/courier";\nimport config from "./courier.config";\n// registerSources(config.sources);\n',
    });
    const others = projectOf({
      "src/hooks.server.ts":
        'import { registerSources } from "@noverax/courier";\nimport config from "../courier.config";\nimport { legacy } from "./legacy";\nregisterSources({ legacy });\nregisterSources(legacy.sources);\n',
    });
    const packaged = projectOf({
      "src/server.ts":
        'import { registerSources } from "@noverax/courier";\nimport config from "@noverax/courier/config";\nregisterSources(config.sources);\n',
    });

    expect(registeringFile(commented)).toBeUndefined();
    expect(registeringFile(others)).toBeUndefined();
    expect(registeringFile(packaged)).toBeUndefined();
  });

  it("leaves out tests, output and dependencies", () => {
    const project = projectOf({
      "tests/register.test.ts":
        'import { registerSources } from "@noverax/courier";\nimport config from "../courier.config";\nregisterSources(config.sources);\n',
      "dist/server.js":
        'import { registerSources } from "@noverax/courier";\nimport config from "../courier.config";\nregisterSources(config.sources);\n',
    });

    expect(registeringFile(project)).toBeUndefined();
  });
});

describe("studioServerFile", () => {
  it("finds the server's connection, and not one in a comment or a file only the browser runs", () => {
    const server = projectOf({
      "src/index.ts": `import("@noverax/courier-studio-core/runtime")
  .then(({ attachRuntime }) => attachRuntime())
  .catch(() => undefined);
`,
    });
    /* Next.js and SvelteKit load both files by their place: only their being the browser's keeps them out. */
    const elsewhere = projectOf(
      {
        "instrumentation-client.ts":
          'import { attachRuntime } from "@noverax/courier-studio-core/runtime";\nattachRuntime("next-browser");\n',
        "src/hooks.client.ts":
          'import { attachRuntime } from "@noverax/courier-studio-core/runtime";\nattachRuntime();\n',
        "instrumentation.ts":
          '// const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");\n// await attachRuntime();\nexport {};\n',
      },
      { next: "16.4.0", "@sveltejs/kit": "^2.40.0" },
    );

    expect(studioServerFile(server)).toBe("src/index.ts");
    expect(studioServerFile(elsewhere)).toBeUndefined();
    expect(attachesStudio(elsewhere, "instrumentation-client.ts")).toBe(true);
    expect(attachesStudio(elsewhere, "instrumentation.ts")).toBe(false);
  });
});

describe("fileUsing", () => {
  it("finds the file that serves with the framework's package, and not one that only names it", () => {
    const project = projectOf(
      {
        "app/api/courier/route.ts":
          'import { apiRoute } from "@noverax/courier-next";\nexport const { GET, POST } = apiRoute();\n',
        "app/api/other/route.ts": 'const note = "apiRoute() from @noverax/courier-next";\n',
        "src/app.ts":
          'import { courierPlugin } from "@noverax/courier-fastify";\nawait app.register(courierPlugin, { prefix: "/api/request" });\n',
      },
      { next: "16.4.0" },
    );

    expect(fileUsing(project, "@noverax/courier-next", "apiRoute")).toEqual({
      path: "app/api/courier/route.ts",
      loaded: true,
    });
    expect(fileUsing(project, "@noverax/courier-fastify", "courierPlugin", false)).toEqual({
      path: "src/app.ts",
      loaded: true,
    });
    expect(fileUsing(project, "@noverax/courier-fastify", "courierPlugin")).toBeUndefined();
    expect(fileUsing(project, "@noverax/courier-hono", "courierHandler")).toBeUndefined();
  });
});

describe("a file nothing loads", () => {
  const REGISTERS =
    'import { registerSources } from "@noverax/courier";\nimport config from "../courier.config";\nregisterSources(config.sources);\n';

  it("does not register, until a file of the project's imports it or a script runs it", () => {
    const alone = projectOf({ "lib/boot.ts": REGISTERS });
    const imported = projectOf({
      "lib/boot.ts": REGISTERS,
      "src/index.ts": 'import "../lib/boot";\n',
    });
    const aliased = projectOf({
      "lib/boot.ts": REGISTERS,
      "src/index.ts": 'import "@/lib/boot";\n',
    });
    const run = readProject(
      projectWith({
        "package.json": JSON.stringify({ scripts: { dev: "tsx watch lib/boot.ts" } }),
        "courier.config.ts": CONFIG,
        "lib/boot.ts": REGISTERS,
      }),
    );

    expect(registeringFile(alone)).toBeUndefined();
    expect(registeringFile(imported)).toBe("lib/boot.ts");
    expect(registeringFile(aliased)).toBe("lib/boot.ts");
    expect(registeringFile(run)).toBe("lib/boot.ts");
    expect(registeringFile(alone, "lib/boot.ts")).toBe("lib/boot.ts");
  });

  it("serves no proxy, and a file a framework loads by its place needs no import", () => {
    const router =
      'import { Router } from "express";\nimport { courierHandler } from "@noverax/courier-express";\nexport const courier = Router();\ncourier.all("/api/request", courierHandler());\n';
    const unmounted = projectOf({
      "src/courier/routes.ts": router,
      "src/index.ts": "export {};\n",
    });
    const mounted = projectOf({
      "src/courier/routes.ts": router,
      "src/index.ts": 'import { courier } from "./courier/routes.js";\napp.use(courier);\n',
    });
    const hooks = projectOf({ "src/hooks.server.ts": REGISTERS }, { "@sveltejs/kit": "^2.40.0" });

    expect(fileUsing(unmounted, "@noverax/courier-express", "courierHandler")).toEqual({
      path: "src/courier/routes.ts",
      loaded: false,
    });
    expect(fileUsing(mounted, "@noverax/courier-express", "courierHandler")?.loaded).toBe(true);
    expect(registeringFile(hooks)).toBe("src/hooks.server.ts");
  });
});

describe("a large project", () => {
  it("reads the files that wire an app up before thousands of others", () => {
    const components = Object.fromEntries(
      Array.from({ length: 4100 }, (_, at) => [`components/c${at}.tsx`, "export const c = 1;\n"]),
    );
    const project = projectOf(
      {
        ...components,
        "instrumentation.ts":
          'import { registerSources } from "@noverax/courier";\nexport async function register() {\n  const { default: config } = await import("./courier.config");\n  registerSources(config.sources);\n}\n',
      },
      { next: "16.4.0" },
    );

    expect(registeringFile(project)).toBe("instrumentation.ts");
  }, 60_000);
});

describe("the files read for what the app wires up", () => {
  const REGISTER =
    'import { registerSources } from "@noverax/courier";\nimport config from "../courier.config";\nregisterSources(config.sources);\n';

  it("leave a test out: registering there registers nothing in the app", () => {
    const project = readProject(
      projectWith({
        "package.json": JSON.stringify({ main: "src/app.ts", dependencies: {} }),
        "courier.config.ts": CONFIG,
        "src/app.ts": 'import "./app.test";\n',
        "src/app.test.ts": REGISTER,
      }),
    );

    expect(registeringFile(project)).toBeUndefined();
  });

  it("leave out a file too large to be the app's own", () => {
    const project = readProject(
      projectWith({
        "package.json": JSON.stringify({ main: "src/app.ts", dependencies: {} }),
        "courier.config.ts": CONFIG,
        "src/app.ts": `${REGISTER}// ${"x".repeat(600 * 1024)}\n`,
      }),
    );

    expect(registeringFile(project)).toBeUndefined();
  });

  it("read the files that wire an app up first, in a project with more files than are read", () => {
    const filler = Object.fromEntries(
      Array.from({ length: 4001 }, (_, at) => [`a/file${at}.ts`, "export {};\n"]),
    );
    const project = readProject(
      projectWith({
        "package.json": JSON.stringify({ main: "src/deep/down/server.ts", dependencies: {} }),
        "courier.config.ts": CONFIG,
        ...filler,
        "src/deep/down/server.ts": REGISTER.replace("../courier.config", "../../../courier.config"),
      }),
    );

    expect(registeringFile(project)).toBe("src/deep/down/server.ts");
  }, 30_000);
});
