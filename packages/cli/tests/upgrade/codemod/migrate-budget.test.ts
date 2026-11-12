/**
 * What carrying a large project's code over costs — the budget it is held
 * to: 2000 files of about 5 KB of a workspace, an app built with Vite and
 * two packages of its own, every file importing Courier and checking its
 * errors, so that every one is read, parsed and walked, every module of
 * the app importing both packages by name — one through the entries its
 * exports give, one whose entry is its build's — and every tenth file
 * written for 0.4 with every change of 0.4 and 0.5 to make, read and
 * migrated in 3 s of a developer's machine.
 *
 * Parsed again before each migration, and walked with the nodes above
 * each node copied, such a project took 23 s. Parsed once, and again only
 * after a change, for the migrations whose words a file writes, and
 * walked down a list read once per tree, it took about 2.7 s, half of it
 * oxc handing each tree over as JSON. Taken through the memory oxc shares
 * with JavaScript instead, a tree costs a sixth as much: the project
 * takes about 1.3 s on Node 26 and 1.45 s on Node 22, and one whose every
 * file has every change to make about 4.5 s, against 10 s. The graph of
 * the project's imports, which tells a page's code from the server's, is
 * read with it, once, from oxc's record of each module: about 0.3 s of
 * that. With the trees as JSON, as on Windows, the same machine takes
 * about 2.7 s, and under coverage, which counts each block of code as it
 * runs, about 3.1 s on Node 24.
 *
 * The time counted is the test's own thread's: the other test files run
 * in processes of their own, and the threads V8 compiles and collects on
 * beside it do not count either. It is counted in seconds of the
 * developer's machine: right before the migration, in the same thread,
 * the test times a fixed piece of work that shares no code with the
 * migration (`reference-work.ts`), and takes the migration's time at what
 * that work costs there against here. The work slows as the migration
 * does — on the Mac's efficiency cores, three to four times slower, the
 * migration reads as on its performance cores to within a fifth — so on
 * a slower machine, as CI's are, it reads as it does on the developer's:
 * on Node 24, about 1.5 s, and 3.1 to 3.6 s with the trees as JSON. Under
 * coverage, whose counters slow the work too, though less than the
 * migration, it reads about 2.4 s, and 3.4 s as JSON. It is held to twice
 * the budget, for what the work cannot tell of a machine, such as how
 * fast it reads files.
 */
import { afterAll, describe, expect, it } from "vitest";

import { migrateCode } from "../../../src/upgrade/codemod/run-migrations";
import { projectCode } from "../../../src/upgrade/codemod/source-files";
import { projectSides } from "../../../src/upgrade/entries/piece-sides";
import { RELEASES } from "../../../src/upgrade/releases";
import { workspaceOf } from "../../../src/upgrade/workspace";
import { REFERENCE_MS, referenceMs } from "../../helpers/reference-work";
import { manifest, projectWith, removeProjects } from "../../helpers/temp-project";

afterAll(removeProjects);

const BUDGET_MS = 3000;
const FILES = 2000;
const MIGRATIONS = RELEASES.flatMap((release) => release.migrations);

/* Code written for 0.4 that every migration of 0.4.0 and 0.5.0 has something to do with. */
const OLD = `import { loadCourierConfig } from "@noverax/courier-studio-core/config";
import { AuthError, createWSHandler, isHTTPError, sendAuthRequired, TimeoutError } from "@noverax/courier";
import { retryMiddleware } from "@noverax/courier/middleware";
import type { SSESubscription } from "@noverax/courier/realtime";

const handler = createWSHandler({});
const retry = retryMiddleware({ retryOn: [0, 503] });
let stream: SSESubscription;

export async function revoke(id: string, error: unknown) {
  sendAuthRequired(handler.connections, id, 10_000);
  if (isHTTPError(error) && error.status === 0) throw new TimeoutError();
  if (error instanceof AuthError) await loadCourierConfig();
  handler.connections.disconnect(id, 4003, "Banned");
}
`;

/* Code that checks Courier's errors and has nothing to carry over. */
const CURRENT = `import { endpoint, isHTTPError } from "@noverax/courier";

export const orders = endpoint.get("orders").variables<{ id: string }>();

export async function load(id: string) {
  try {
    return await orders.call({ id });
  } catch (error) {
    if (isHTTPError(error) && error.status === 404) return undefined;
    throw error;
  }
}
`;

/* The rest of a module: a dozen functions of the project's own. */
function rest(seed: number): string {
  return Array.from(
    { length: 12 },
    (_, at) => `
export function total${seed}x${at}(input: { id: string; items: number[] }) {
  const sum = input.items.reduce((all, item) => all + item * ${at}, 0);
  const label = \`\${input.id}:\${sum}\`;
  if (sum > ${seed}) return { label, sum, items: input.items.map((item) => ({ item, half: item / 2 })) };
  return { label, sum: sum + 1, items: [] as Array<{ item: number; half: number }> };
}
`,
  ).join("");
}

/* The app's modules first, then the files of the package its entries give, then the one whose entry is its build's. */
function pathOf(at: number): string {
  if (at < 1600) return `apps/shop/src/feature-${at % 40}/module-${at}.ts`;
  return at < 1900 ? `packages/ui/src/c${at}.ts` : `packages/legacy/src/l${at}.ts`;
}

function fileOf(at: number): string {
  const uses =
    at < 1600
      ? `import { f } from "@shop/ui";\nimport { g } from "@shop/ui/c${1600 + (at % 300)}";\nimport { h } from "@shop/legacy";\n`
      : "";
  return uses + (at % 10 === 0 ? OLD : CURRENT) + rest(at);
}

describe("carrying a large project's code over", () => {
  it("reads and migrates 2000 files within its budget", () => {
    const root = projectWith({
      "package.json": manifest({
        name: "shop",
        private: true,
        workspaces: ["apps/*", "packages/*"],
      }),
      "apps/shop/package.json": manifest({
        name: "@shop/app",
        dependencies: { vite: "7.0.0", react: "19.0.0", "@shop/ui": "*", "@shop/legacy": "*" },
      }),
      "packages/ui/package.json": manifest({
        name: "@shop/ui",
        exports: { ".": "./src/index.ts", "./*": "./src/*.ts" },
      }),
      "packages/ui/src/index.ts": "export const f = 1;\n",
      "packages/legacy/package.json": manifest({ name: "@shop/legacy", main: "./dist/index.js" }),
      ...Object.fromEntries(Array.from({ length: FILES }, (_, at) => [pathOf(at), fileOf(at)])),
    });

    const reference = referenceMs();
    const started = process.threadCpuUsage();
    const code = projectCode(root);
    const migrated = migrateCode(code, MIGRATIONS, projectSides(workspaceOf(root), code));
    const spent = process.threadCpuUsage(started);
    const here = (spent.user + spent.system) / 1000;
    /* The time the developer's machine would take: this one's, at what the reference work costs there against here. */
    const there = here * (REFERENCE_MS / reference);

    expect(code.files).toHaveLength(FILES);
    expect(migrated.edits).toHaveLength(FILES / 10);
    expect(there, `${Math.round(here)} ms here, the reference work ${reference} ms`).toBeLessThan(
      2 * BUDGET_MS,
    );
  });
});
