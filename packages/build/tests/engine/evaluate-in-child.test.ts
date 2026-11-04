/**
 * @vitest-environment node
 *
 * A project's routes, read in a process started for the one reading, as the
 * built package starts it: the routes of every source, the files and the
 * variables they depended on, and each way a reading fails. Requires a
 * build of this package first, whose worker the process runs.
 */
import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateInChild } from "../../src/engine/evaluate-in-child";
import { RoutesReadError } from "../../src/engine/routes-read-error";

/* The repository's packages, where a config's `@noverax/courier` resolves from. */
const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../../node_modules");

/* The built package, as a bundler's process imports it. */
const BUILT = resolve(import.meta.dirname, "../../lib/index.js");

const APIS = `import { courier, defineApi, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const shop = defineApi({
  baseURL: "https://shop.example.com",
  endpoints: { search: endpoint.get("search").expose(process.env.SHOP_SEARCH_PUBLIC === "1") },
  groups: {
    cart: defineGroup({ endpoints: { add: endpoint.post("cart").expose(), view: endpoint.get("cart") } }),
  },
});

export const payments = defineApi({
  baseURL: "https://pay.example.com",
  endpoints: { charge: endpoint.post("charge") },
});
`;

const CONFIG = `import { payments, shop } from "./apis";

export default { sources: { shop, payments } };
`;

let dir: string;
/* Processes a test started, killed after it whatever it found. */
const started: number[] = [];

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-evaluate-in-child-")));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
  writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
});

afterEach(() => {
  for (const pid of started.splice(0)) if (isAlive(pid)) process.kill(pid, "SIGKILL");
  rmSync(dir, { recursive: true, force: true });
});

/* Whether a process is still running: signal 0 asks the system without signalling it. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/* A config that writes the pid of the process reading it, then never finishes loading. */
function configThatHangs(pidFile: string, before = ""): string {
  return `import { writeFileSync } from "node:fs";
${CONFIG}
${before}
writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
setInterval(() => {}, 1_000);
await new Promise(() => {});
`;
}

async function pidIn(file: string): Promise<number> {
  await vi.waitFor(() => expect(existsSync(file)).toBe(true), { timeout: 20_000 });
  const pid = Number(readFileSync(file, "utf8"));
  started.push(pid);
  return pid;
}

function project(config: string = CONFIG): void {
  writeFileSync(join(dir, "apis.ts"), APIS);
  writeFileSync(join(dir, "courier.config.ts"), config);
}

async function failure(promise: Promise<unknown>): Promise<RoutesReadError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!(error instanceof RoutesReadError))
    throw new Error(`expected a RoutesReadError, got ${String(error)}`);
  return error;
}

describe("evaluateInChild", () => {
  it("reads the routes of every source, one that opens nothing to a page among them", async () => {
    project();

    const snapshot = await evaluateInChild({ root: dir, envFiles: [] });

    expect(Object.keys(snapshot.routes)).toEqual(["payments", "shop"]);
    expect(snapshot.routes.payments).toEqual({ source: "payments", endpoints: {} });
    expect(snapshot.routes.shop?.endpoints).toEqual({ "cart.add": { type: "mutation" } });
  }, 30_000);

  it("keeps a source named __proto__ among the routes, as the config names it", async () => {
    project(
      `import { payments, shop } from "./apis";\n\nexport default { sources: { shop, ["__proto__"]: payments } };\n`,
    );

    const snapshot = await evaluateInChild({ root: dir, envFiles: [] });

    expect(Object.keys(snapshot.routes)).toEqual(["__proto__", "shop"]);
    expect(Object.getOwnPropertyDescriptor(snapshot.routes, "__proto__")?.value).toEqual({
      source: "__proto__",
      endpoints: {},
    });
  }, 30_000);

  it("reads the project's env files before the config, the first that sets a variable winning", async () => {
    project();
    writeFileSync(join(dir, ".env.production"), "SHOP_SEARCH_PUBLIC=1\n");
    writeFileSync(join(dir, ".env"), "SHOP_SEARCH_PUBLIC=0\n");

    const snapshot = await evaluateInChild({
      root: dir,
      envFiles: [join(dir, ".env.production"), join(dir, ".env")],
    });

    expect(Object.keys(snapshot.routes.shop?.endpoints ?? {})).toEqual(["cart.add", "search"]);
  }, 30_000);

  it("reads a config that assigns variables already set, one by one or many at once", async () => {
    project(`import "./env-setup";\n${CONFIG}`);
    writeFileSync(
      join(dir, "env-setup.ts"),
      'process.env.API_HOST = process.env.API_HOST ?? "localhost";\nObject.assign(process.env, { SHOP_SEARCH_PUBLIC: "1" });\n',
    );
    writeFileSync(join(dir, ".env"), "API_HOST=api.internal\nSHOP_SEARCH_PUBLIC=0\n");

    const snapshot = await evaluateInChild({ root: dir, envFiles: [join(dir, ".env")] });

    expect(Object.keys(snapshot.routes.shop?.endpoints ?? {})).toEqual(["cart.add", "search"]);
  }, 30_000);

  it("names the config, the modules it reached, the env files and the variables it looked at", async () => {
    project();

    const snapshot = await evaluateInChild({ root: dir, envFiles: [join(dir, ".env.local")] });

    expect(snapshot.configFile).toBe(join(dir, "courier.config.ts"));
    expect(snapshot.files).toEqual(
      expect.arrayContaining([
        join(dir, "courier.config.ts"),
        join(dir, "apis.ts"),
        join(dir, ".env.local"),
      ]),
    );
    expect(snapshot.env).toContain("SHOP_SEARCH_PUBLIC");
    expect(snapshot.env).not.toContain("JITI_DEBUG");
  }, 30_000);

  it("names the ES modules Node loads itself for the config, besides those its loader transforms", async () => {
    project(`import "./flags.mjs";\nimport "./limits.js";\n${CONFIG}`);
    writeFileSync(join(dir, "flags.mjs"), "export const open = true;\n");
    writeFileSync(join(dir, "limits.js"), "export const max = 3;\n");

    const snapshot = await evaluateInChild({ root: dir, envFiles: [] });

    expect(snapshot.files).toEqual(
      expect.arrayContaining([join(dir, "flags.mjs"), join(dir, "limits.js")]),
    );
  }, 30_000);

  it("names the files the config reads and the folders it lists, besides the modules it imports", async () => {
    const flags = join(dir, "flags.json");
    const defs = join(dir, "defs");
    project(`import { readdirSync, readFileSync } from "node:fs";
${CONFIG}
JSON.parse(readFileSync(${JSON.stringify(flags)}, "utf8"));
readdirSync(${JSON.stringify(defs)});
`);
    writeFileSync(flags, "{}\n");
    mkdirSync(defs);

    const snapshot = await evaluateInChild({ root: dir, envFiles: [] });

    expect(snapshot.files).toContain(flags);
    expect(snapshot.listed).toEqual([defs]);
  }, 30_000);

  it("names a file the config reads and a folder it lists as the system does, however the config writes them", async () => {
    const flags = join(dir, "flags.json");
    const limits = join(dir, "limits.json");
    const defs = join(dir, "defs");
    project(`import { readdirSync, readFileSync } from "node:fs";
import { toNamespacedPath } from "node:path";
${CONFIG}
readFileSync(${JSON.stringify(`${dir}/sub/../flags.json`)}, "utf8");
readFileSync(toNamespacedPath(${JSON.stringify(limits)}), "utf8");
readdirSync(${JSON.stringify(`${dir}/./defs/`)});
`);
    mkdirSync(join(dir, "sub"));
    writeFileSync(flags, "{}\n");
    writeFileSync(limits, "{}\n");
    mkdirSync(defs);

    const snapshot = await evaluateInChild({ root: dir, envFiles: [] });

    expect(snapshot.files).toEqual(expect.arrayContaining([flags, limits]));
    expect(snapshot.files.filter((file) => file.endsWith("flags.json"))).toEqual([flags]);
    expect(snapshot.files.filter((file) => file.endsWith("limits.json"))).toEqual([limits]);
    expect(snapshot.listed).toEqual([defs]);
  }, 30_000);

  it("fails CONFIG_NOT_FOUND where no config is in the root or a folder above it", async () => {
    const error = await failure(evaluateInChild({ root: dir, envFiles: [] }));

    expect(error.code).toBe("CONFIG_NOT_FOUND");
    expect(error.message).toContain(dir);
  }, 30_000);

  it("fails CONFIG_NOT_LOADED with what went wrong, for a config that throws", async () => {
    project(`${CONFIG}\nthrow new Error("SHOP_API_KEY is not set");\n`);

    const error = await failure(evaluateInChild({ root: dir, envFiles: [] }));

    expect(error.code).toBe("CONFIG_NOT_LOADED");
    expect(error.message).toMatch(/courier\.config\.ts did not load.*SHOP_API_KEY is not set/);
    expect(error.context).toEqual({ root: dir, configFile: join(dir, "courier.config.ts") });
    expect(error.stack).toContain("courier.config.ts");
  }, 30_000);

  it("names what a failing reading had read, as what may mend it", async () => {
    project();
    writeFileSync(join(dir, "apis.ts"), `${APIS}\nthrow new Error("apis is broken");\n`);

    const error = await failure(evaluateInChild({ root: dir, envFiles: [join(dir, ".env")] }));

    expect(error.code).toBe("CONFIG_NOT_LOADED");
    expect(error.inputs?.configFile).toBe(join(dir, "courier.config.ts"));
    expect(error.inputs?.files).toEqual(
      expect.arrayContaining([
        join(dir, "courier.config.ts"),
        join(dir, "apis.ts"),
        join(dir, ".env"),
      ]),
    );
  }, 30_000);

  it("names every path a config was looked for at, when none is there", async () => {
    const error = await failure(evaluateInChild({ root: dir, envFiles: [] }));

    expect(error.inputs?.files).toEqual(
      expect.arrayContaining([join(dir, "courier.config.ts"), join(dir, "courier.config.cjs")]),
    );
  }, 30_000);

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "fails CONFIG_NOT_TRUSTED for a config above the root that any user may write, and runs none of it",
    async () => {
      project(`${CONFIG}\nprocess.exitCode = 3;\n`);
      chmodSync(join(dir, "courier.config.ts"), 0o666);
      mkdirSync(join(dir, "app"));

      const error = await failure(evaluateInChild({ root: join(dir, "app"), envFiles: [] }));

      expect(error.code).toBe("CONFIG_NOT_TRUSTED");
      expect(error.message).toContain("any user may write it");
    },
    30_000,
  );

  it("fails CONFIG_NOT_LOADED for a config that names no sources", async () => {
    project("export default { studio: { port: 6290 } };\n");

    const error = await failure(evaluateInChild({ root: dir, envFiles: [] }));

    expect(error.code).toBe("CONFIG_NOT_LOADED");
    expect(error.message).toContain("exports no `sources`");
    expect(error.context.configFile).toBe(join(dir, "courier.config.ts"));
  }, 30_000);

  it("gives up a config that never finishes loading, ROUTES_NOT_READ", async () => {
    project(`${CONFIG}\nwhile (true) {}\n`);

    const error = await failure(evaluateInChild({ root: dir, envFiles: [] }, 1_500));

    expect(error.code).toBe("ROUTES_NOT_READ");
    expect(error.message).toContain("given up");
  }, 30_000);

  it("reads the routes of a config that sends the process running it a message of its own", async () => {
    project(`${CONFIG}\nprocess.send?.("ready");\n`);

    const snapshot = await evaluateInChild({ root: dir, envFiles: [] });

    expect(Object.keys(snapshot.routes)).toEqual(["payments", "shop"]);
  }, 30_000);

  it("ends a process the config keeps running and deaf to SIGTERM, once it gives it up", async () => {
    const pidFile = join(dir, "reader.pid");
    project(configThatHangs(pidFile, 'process.on("SIGTERM", () => {});'));

    const error = await failure(evaluateInChild({ root: dir, envFiles: [] }, 1_500));
    const pid = await pidIn(pidFile);

    expect(error.code).toBe("ROUTES_NOT_READ");
    await vi.waitFor(() => expect(isAlive(pid)).toBe(false), { timeout: 10_000 });
  }, 30_000);

  it("ends the process reading the config once the process that asked is gone", async () => {
    const pidFile = join(dir, "reader.pid");
    project(configThatHangs(pidFile));
    const asker = spawn(process.execPath, [
      "--input-type=module",
      "-e",
      `import { createRoutesEngine } from ${JSON.stringify(BUILT)};
createRoutesEngine({ root: ${JSON.stringify(dir)} }).read().catch(() => {});
setInterval(() => {}, 1_000);`,
    ]);
    if (asker.pid !== undefined) started.push(asker.pid);
    const pid = await pidIn(pidFile);

    asker.kill("SIGKILL");

    await vi.waitFor(() => expect(isAlive(pid)).toBe(false), { timeout: 10_000 });
  }, 30_000);

  it("answers whatever the config leaves running, and ends its process", async () => {
    project(`${CONFIG}\nsetInterval(() => {}, 1_000);\n`);

    const snapshot = await evaluateInChild({ root: dir, envFiles: [] });

    expect(Object.keys(snapshot.routes)).toEqual(["payments", "shop"]);
  }, 30_000);
});
