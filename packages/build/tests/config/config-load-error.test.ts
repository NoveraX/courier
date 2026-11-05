/**
 * @vitest-environment node
 *
 * Why a project's config did not load, as every loader says it: what failed,
 * in which module, the chain of imports from the config to it, and what to
 * do — never the value of an environment variable.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCourierConfig } from "../../src/config/load-config";
import { ConfigLoadError } from "../../src/config/load-error/config-load-error";

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-config-load-error-")));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

function write(relPath: string, body: string): void {
  const full = join(dir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body, "utf8");
}

/** A project whose config imports `src/api.ts`, which holds `api`. */
function project(dependencies: Record<string, string>, api: string): void {
  write("package.json", JSON.stringify({ type: "module", dependencies }));
  write("src/api.ts", api);
  write(
    "courier.config.ts",
    `import { api } from "./src/api";\nexport default { sources: { api } };\n`,
  );
}

async function failure(timeoutMs?: number): Promise<ConfigLoadError> {
  const error = await loadCourierConfig({ cwd: dir, timeoutMs }).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!(error instanceof ConfigLoadError))
    throw new Error(`expected a ConfigLoadError, got ${String(error)}`);
  return error;
}

describe("an import that does not resolve", () => {
  it("names the module that made it, and the chain of imports from the config", async () => {
    write("src/server/db.ts", `import { pool } from "./pool";\nexport const db = pool;\n`);
    project({}, `import { db } from "./server/db";\nexport const api = { db };\n`);

    const error = await failure();

    expect(error.code).toBe("MODULE_NOT_FOUND");
    expect(error.message).toBe(
      'src/server/db.ts imports "./pool", which does not resolve (courier.config.ts → src/api.ts → src/server/db.ts).',
    );
    expect(error.hint).toBe("Correct the import, or create the module it names.");
    expect(error.context).toEqual({
      entry: join(dir, "courier.config.ts"),
      specifier: "./pool",
      importChain: [
        join(dir, "courier.config.ts"),
        join(dir, "src/api.ts"),
        join(dir, "src/server/db.ts"),
      ],
    });
  });

  it("says to install a package that is not there", async () => {
    project({}, `import pad from "left-pad/lib";\nexport const api = { pad };\n`);

    expect((await failure()).hint).toBe(
      "Install left-pad where the project's packages are, or correct the import.",
    );
  });

  it("names the framework whose module it is, when the project is read as another", async () => {
    project(
      { express: "5" },
      `import { env } from "$env/dynamic/private";\nexport const api = { env };\n`,
    );

    expect((await failure()).hint).toBe(
      '"$env/dynamic/private" is SvelteKit\'s own module. Courier reads this project as Express, by package.json: list @sveltejs/kit there if the project is built with SvelteKit.',
    );
  });

  it("names an installed package that made it, by its name", async () => {
    write(
      "node_modules/fake-auth/package.json",
      JSON.stringify({ name: "fake-auth", main: "index.js" }),
    );
    write("node_modules/fake-auth/index.js", `require("left-pad");\nexports.auth = () => null;\n`);
    project({}, `import { auth } from "fake-auth";\nexport const api = { auth };\n`);

    const error = await failure();

    expect(error.message).toBe(
      'fake-auth imports "left-pad", which does not resolve (courier.config.ts → src/api.ts → fake-auth).',
    );
    expect(error.hint).toBe(
      "Install left-pad where the project's packages are, or correct the import.",
    );
  });

  it("answers server-only in an installed package too, whether server-only is installed or not", async () => {
    write(
      "node_modules/fake-auth/package.json",
      JSON.stringify({ name: "fake-auth", type: "module", exports: "./index.js" }),
    );
    write(
      "node_modules/fake-auth/index.js",
      `import "server-only";\nexport const auth = () => "signed in";\n`,
    );
    project(
      { next: "16.4.3" },
      `import { auth } from "fake-auth";\nexport const api = { said: auth() };\n`,
    );

    const absent = await loadCourierConfig({ cwd: dir });
    write(
      "node_modules/server-only/package.json",
      JSON.stringify({ name: "server-only", main: "index.js" }),
    );
    write(
      "node_modules/server-only/index.js",
      `throw new Error("This module cannot be imported from a Client Component module.");\n`,
    );
    const installed = await loadCourierConfig({ cwd: dir });

    expect(absent?.config.sources).toEqual({ api: { said: "signed in" } });
    expect(installed?.config.sources).toEqual({ api: { said: "signed in" } });
  });
});

describe("a framework's own module", () => {
  it("is refused when Next refuses it on the server", async () => {
    project({ next: "16.4.3" }, `import "client-only";\nexport const api = {};\n`);

    const error = await failure();

    expect(error.code).toBe("MODULE_REFUSED");
    expect(error.message).toBe(
      'src/api.ts imports "client-only": it is the marker of code for the browser, which Next.js refuses on the server, where courier.config is read (courier.config.ts → src/api.ts).',
    );
    expect(error.hint).toBe(
      "Import that code from a client component alone, out of the modules courier.config imports.",
    );
  });

  it.each([
    [
      "Nuxt",
      { nuxt: "4.2.0" },
      "#imports",
      "is one of Nuxt's aliases, which only Nuxt's build resolves",
    ],
    ["Nuxt", { nuxt: "4.2.0" }, "~/server/utils", "nuxi prepare"],
    [
      "SvelteKit",
      { "@sveltejs/kit": "2.48.0" },
      "$app/navigation",
      "is a module of SvelteKit's runtime",
    ],
    ["SvelteKit", { "@sveltejs/kit": "2.48.0" }, "$lib/server/db", "svelte-kit sync"],
    ["Astro", { astro: "5.15.0" }, "astro:content", "is a module of Astro's runtime"],
  ])("is explained as %s explains %s", async (_, dependencies, specifier, said) => {
    project(
      dependencies,
      `import * as runtime from "${specifier}";\nexport const api = { runtime };\n`,
    );

    const error = await failure();

    expect(error.code).toBe("MODULE_NOT_FOUND");
    expect(error.hint).toContain(said);
  });

  it("says Nuxt imports for you what a Nuxt project's module calls without an import", async () => {
    project({ nuxt: "4.2.0" }, `export const api = { config: useRuntimeConfig() };\n`);

    const error = await failure();

    expect(error.code).toBe("EVALUATION_FAILED");
    expect(error.message).toBe(
      "src/api.ts threw ReferenceError: useRuntimeConfig is not defined (courier.config.ts → src/api.ts).",
    );
    expect(error.hint).toMatch(
      /^useRuntimeConfig is not defined outside Nuxt: .* definitions must not depend on Nuxt's runtime\./,
    );
  });
});

describe("a module that does not compile", () => {
  it("is named with where the transformer stopped, and what it said", async () => {
    project({}, `export const api = { a: 1 ;\n`);

    const error = await failure();

    expect(error.code).toBe("TRANSFORM_FAILED");
    expect(error.message).toMatch(
      /^src\/api\.ts:1:\d+ cannot be compiled: [^(]+ \(courier\.config\.ts → src\/api\.ts\)\.$/,
    );
    expect(error.message).not.toContain(dir);
  });
});

describe("code that throws while the config is read", () => {
  it("is quoted with every value of the environment masked", async () => {
    vi.stubEnv("PAYMENTS_TOKEN", "tok_live_4f9c2e7a");
    project(
      {},
      `if (process.env.PAYMENTS_TOKEN) throw new Error("token " + process.env.PAYMENTS_TOKEN + " was refused");\nexport const api = {};\n`,
    );

    const error = await failure();

    expect(error.code).toBe("EVALUATION_FAILED");
    expect(error.message).toBe(
      "src/api.ts threw Error: token [redacted] was refused (courier.config.ts → src/api.ts).",
    );
    expect(error.message).not.toContain("tok_live");
    expect(error.hint).toBe(
      'Courier runs courier.config.ts and every module it imports, as your server would: a module that checks the environment as it is imported needs those variables set where Courier reads the project, or can skip the check while COURIER_PHASE is "definitions".',
    );
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("names the config itself when the config threw", async () => {
    write("package.json", "{}");
    write("courier.config.ts", `throw new TypeError("no sources yet");\n`);

    expect((await failure()).message).toBe("courier.config.ts threw TypeError: no sources yet.");
  });
});

describe("a config that never finishes loading", () => {
  it("is given up after its time, naming the module still waiting", async () => {
    write("src/slow.ts", `await new Promise(() => {});\nexport const api = {};\n`);
    project({}, `export { api } from "./slow";\n`);

    const error = await failure(100);

    expect(error.code).toBe("LOAD_TIMED_OUT");
    expect(error.message).toBe(
      "courier.config.ts was still loading after 0.1 s and was given up (courier.config.ts → src/api.ts → src/slow.ts).",
    );
  });
});
