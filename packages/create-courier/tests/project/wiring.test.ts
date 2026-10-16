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

function projectOf(files: Record<string, string>) {
  return readProject(projectWith({ "package.json": "{}", "courier.config.ts": CONFIG, ...files }));
}

describe("registeringFile", () => {
  it("finds the config's sources registered from a static or a dynamic import of the config", () => {
    const dynamic = projectOf({
      "instrumentation.ts": `import { registerSources } from "@noverax/courier";
export async function register() {
  const { default: config } = await import("./courier.config");
  registerSources(config.sources);
}
`,
    });
    const aliased = projectOf({
      "src/hooks.server.ts": `import * as courier from "@noverax/courier";
import settings from "@/courier.config";
const { sources } = settings;
courier.registerSources(sources);
`,
    });

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
    const elsewhere = projectOf({
      "instrumentation-client.ts":
        'import { attachRuntime } from "@noverax/courier-studio-core/runtime";\nattachRuntime("next-browser");\n',
      "src/hooks.client.ts":
        'import { attachRuntime } from "@noverax/courier-studio-core/runtime";\nattachRuntime();\n',
      "instrumentation.ts":
        '// const { attachRuntime } = await import("@noverax/courier-studio-core/runtime");\n// await attachRuntime();\nexport {};\n',
    });

    expect(studioServerFile(server)).toBe("src/index.ts");
    expect(studioServerFile(elsewhere)).toBeUndefined();
    expect(attachesStudio(elsewhere, "instrumentation-client.ts")).toBe(true);
    expect(attachesStudio(elsewhere, "instrumentation.ts")).toBe(false);
  });
});

describe("fileUsing", () => {
  it("finds the file that serves with the framework's package, and not one that only names it", () => {
    const project = projectOf({
      "app/api/courier/route.ts":
        'import { apiRoute } from "@noverax/courier-next";\nexport const { GET, POST } = apiRoute();\n',
      "app/api/other/route.ts": 'const note = "apiRoute() from @noverax/courier-next";\n',
      "src/app.ts":
        'import { courierPlugin } from "@noverax/courier-fastify";\nawait app.register(courierPlugin, { prefix: "/api/request" });\n',
    });

    expect(fileUsing(project, "@noverax/courier-next", "apiRoute")).toBe(
      "app/api/courier/route.ts",
    );
    expect(fileUsing(project, "@noverax/courier-fastify", "courierPlugin", false)).toBe(
      "src/app.ts",
    );
    expect(fileUsing(project, "@noverax/courier-fastify", "courierPlugin")).toBeUndefined();
    expect(fileUsing(project, "@noverax/courier-hono", "courierHandler")).toBeUndefined();
  });
});
