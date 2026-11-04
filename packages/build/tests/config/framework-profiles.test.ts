/**
 * @vitest-environment node
 *
 * A project whose modules import what its framework's server answers itself
 * — Next's `server-only`, SvelteKit's `$env/*` and `$app/environment`,
 * Astro's `astro:env/*` — loads as it does under that server: the framework
 * is told by the project's package.json, and every module the loader
 * transforms gets the framework's answer.
 */
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createConfigJiti } from "../../src/config/config-jiti";
import { loadCourierConfig } from "../../src/config/load-config";
import { RefusedModuleError } from "../../src/config/profiles/refused-module-error";

/* The copy Next.js resolves `server-only` to: the same manifest as the npm
   package, `react-server` → empty.js, otherwise index.js, which throws. */
const SERVER_ONLY = resolve(
  import.meta.dirname,
  "../../../../node_modules/next/dist/compiled/server-only",
);
const CLIENT_ONLY = resolve(import.meta.dirname, "../../../../node_modules/client-only");

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-framework-profiles-")));
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

/** A project built with `framework`, whose config takes its sources from `src/api.ts`. */
function project(dependencies: Record<string, string>, api: string): void {
  write("package.json", JSON.stringify({ type: "module", dependencies }));
  write("src/api.ts", api);
  write(
    "courier.config.ts",
    `import { api } from "./src/api";\nexport default { sources: { api } };\n`,
  );
}

/** The `api` source the config loaded. */
async function loadedApi(): Promise<Record<string, unknown>> {
  const loaded = await loadCourierConfig({ cwd: dir });
  const api = (loaded?.config.sources as Record<string, unknown> | undefined)?.api;
  if (typeof api !== "object" || api === null) throw new Error("the config has no api source");
  return api as Record<string, unknown>;
}

async function loadFailure(): Promise<unknown> {
  return loadCourierConfig({ cwd: dir }).then(
    () => {
      throw new Error("the config loaded");
    },
    (error: unknown) => error,
  );
}

describe("a Next.js project", () => {
  const NEXT = { next: "16.4.3", react: "19.2.0" };

  it("loads a server module that imports server-only, which Next resolves itself", async () => {
    project(
      NEXT,
      `import "server-only";\nexport const api = { baseURL: "https://api.example.com" };\n`,
    );

    expect(await loadedApi()).toEqual({ baseURL: "https://api.example.com" });
  });

  it("loads it with the server-only package installed, whose own entry throws outside Next", async () => {
    project(
      NEXT,
      `import "server-only";\nexport const api = { baseURL: "https://api.example.com" };\n`,
    );
    cpSync(SERVER_ONLY, join(dir, "node_modules/server-only"), { recursive: true });

    expect(await loadedApi()).toEqual({ baseURL: "https://api.example.com" });
  });

  it("loads a module two imports below the config that marks itself server-only", async () => {
    write("src/server/db.ts", `import "server-only";\nexport const url = "postgres://db";\n`);
    project(NEXT, `import { url } from "./server/db";\nexport const api = { url };\n`);

    expect(await loadedApi()).toEqual({ url: "postgres://db" });
  });

  it("refuses client-only, installed or not, as Next does on the server", async () => {
    project(NEXT, `import "client-only";\nexport const api = {};\n`);
    const absent = await loadFailure();
    cpSync(CLIENT_ONLY, join(dir, "node_modules/client-only"), { recursive: true });
    const installed = await loadFailure();

    for (const error of [absent, installed]) {
      expect(error).toBeInstanceOf(RefusedModuleError);
      expect((error as RefusedModuleError).message).toBe(
        "client-only is the marker of code for the browser, which Next.js refuses on the server, where courier.config is read. Import that code from a client component alone, out of the modules courier.config imports.",
      );
      expect((error as RefusedModuleError).context).toEqual({
        specifier: "client-only",
        framework: "Next.js",
      });
    }
  });

  it("leaves server-only to the project when its tsconfig paths name it", async () => {
    project(NEXT, `import { mark } from "server-only";\nexport const api = { mark };\n`);
    write("src/server-only.ts", `export const mark = "the project's own";\n`);
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { paths: { "server-only": ["./src/server-only.ts"] } } }),
    );

    expect(await loadedApi()).toEqual({ mark: "the project's own" });
  });
});

describe("a SvelteKit project", () => {
  const SVELTEKIT = { "@sveltejs/kit": "2.48.0", svelte: "5.40.0" };

  it("reads $env/static/private and $env/static/public, split by the PUBLIC_ prefix", async () => {
    vi.stubEnv("API_SECRET", "s3cr3t-value");
    vi.stubEnv("PUBLIC_API_URL", "https://api.example.com");
    project(
      SVELTEKIT,
      `import { API_SECRET, PUBLIC_API_URL as leaked } from "$env/static/private";
import * as publicEnv from "$env/static/public";
export const api = {
  secret: API_SECRET,
  leaked: leaked ?? null,
  baseURL: publicEnv.PUBLIC_API_URL,
  publicSecret: (publicEnv as Record<string, unknown>).API_SECRET ?? null,
  publicKeys: Object.keys(publicEnv).filter((name) => name.endsWith("_API_URL")),
};
`,
    );

    expect(await loadedApi()).toEqual({
      secret: "s3cr3t-value",
      leaked: null,
      baseURL: "https://api.example.com",
      publicSecret: null,
      publicKeys: ["PUBLIC_API_URL"],
    });
  });

  it("reads $env/dynamic/private and $env/dynamic/public as SvelteKit's env objects", async () => {
    vi.stubEnv("API_SECRET", "s3cr3t-value");
    vi.stubEnv("PUBLIC_API_URL", "https://api.example.com");
    project(
      SVELTEKIT,
      `import { env } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";
export const api = { secret: env.API_SECRET, baseURL: publicEnv.PUBLIC_API_URL, hidden: publicEnv.API_SECRET ?? null };
`,
    );

    expect(await loadedApi()).toEqual({
      secret: "s3cr3t-value",
      baseURL: "https://api.example.com",
      hidden: null,
    });
  });

  it("reads $app/environment as SvelteKit does while it analyses the server", async () => {
    vi.stubEnv("NODE_ENV", "production");
    project(
      SVELTEKIT,
      `import { browser, building, dev, version } from "$app/environment";\nexport const api = { browser, building, dev, version };\n`,
    );

    expect(await loadedApi()).toEqual({ browser: false, building: true, dev: false, version: "" });
  });

  it("shows variables alone, nothing the environment object inherits", async () => {
    project(
      SVELTEKIT,
      `import * as env from "$env/static/private";\nexport const api = { toString: typeof (env as Record<string, unknown>).toString, constructor: typeof (env as Record<string, unknown>).constructor };\n`,
    );

    expect(await loadedApi()).toEqual({ toString: "undefined", constructor: "undefined" });
  });

  it("keeps the environment modules read-only, as SvelteKit's are", async () => {
    project(
      SVELTEKIT,
      `import { env } from "$env/dynamic/private";\nexport const api = { wrote: Reflect.set(env, "API_SECRET", "x") };\n`,
    );

    expect(await loadedApi()).toEqual({ wrote: false });
  });
});

describe("an Astro project", () => {
  it("reads astro:env/server, with getSecret, and astro:env/client", async () => {
    vi.stubEnv("API_SECRET", "s3cr3t-value");
    vi.stubEnv("PUBLIC_API_URL", "https://api.example.com");
    project(
      { astro: "5.15.0" },
      `import { API_SECRET, getSecret } from "astro:env/server";
import { PUBLIC_API_URL } from "astro:env/client";
export const api = { secret: API_SECRET, fromGetSecret: getSecret("API_SECRET"), baseURL: PUBLIC_API_URL };
`,
    );

    expect(await loadedApi()).toEqual({
      secret: "s3cr3t-value",
      fromGetSecret: "s3cr3t-value",
      baseURL: "https://api.example.com",
    });
  });
});

describe("a project that lists no framework answering imports of its own", () => {
  it("resolves server-only as Node does, finding nothing", async () => {
    project({ express: "5.1.0" }, `import "server-only";\nexport const api = {};\n`);

    expect(String(await loadFailure())).toContain("Cannot find module 'server-only'");
  });

  it("is read by the framework of the package.json nearest the config", async () => {
    write("package.json", JSON.stringify({ dependencies: { next: "16.4.3" } }));
    mkdirSync(join(dir, "web"));
    write("web/package.json", JSON.stringify({ type: "module", dependencies: { express: "5" } }));
    write("web/api.ts", `import "server-only";\nexport const api = {};\n`);
    write(
      "web/courier.config.ts",
      `import { api } from "./api";\nexport default { sources: { api } };\n`,
    );

    const failure = await loadCourierConfig({ cwd: join(dir, "web") }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(String(failure)).toContain("Cannot find module 'server-only'");
  });
});

describe("createConfigJiti", () => {
  it("takes the profile its caller names over the one package.json tells", async () => {
    project({ next: "16.4.3" }, `import "server-only";\nexport const api = {};\n`);
    const file = join(dir, "src/api.ts");
    const jiti = await createConfigJiti(file, {
      profile: { framework: undefined, modules: new Map() },
    });

    await expect(jiti.import(file)).rejects.toThrow("Cannot find module 'server-only'");
  });
});
