/**
 * What carrying a large project's code over costs — the budget it is held
 * to: 2000 files of about 5 KB, every one importing Courier and checking
 * its errors, so that every one is read, parsed and walked, and every
 * tenth written for 0.4 with every change of 0.4 and 0.5 to make, read
 * and migrated in 3 s of a developer's machine.
 *
 * Parsed again before each migration, and walked with the nodes above
 * each node copied, such a project took 23 s. Parsed once, and again only
 * after a change, for the migrations whose words a file writes, and
 * walked down a list read once per tree, it takes about 2.2 s; a project
 * whose every file has every change to make, about 10 s.
 *
 * The time counted is the test's own thread's, so the suites run beside
 * it do not count; it is held to twice the budget, for CI's slower
 * machines.
 */
import { afterAll, describe, expect, it } from "vitest";

import { migrateCode } from "../../../src/upgrade/codemod/run-migrations";
import { projectCode } from "../../../src/upgrade/codemod/source-files";
import { RELEASES } from "../../../src/upgrade/releases";
import { projectWith, removeProjects } from "../../helpers/temp-project";

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

describe("carrying a large project's code over", () => {
  it("reads and migrates 2000 files within its budget", () => {
    const root = projectWith(
      Object.fromEntries(
        Array.from({ length: FILES }, (_, at) => [
          `src/feature-${at % 40}/module-${at}.ts`,
          (at % 10 === 0 ? OLD : CURRENT) + rest(at),
        ]),
      ),
    );

    const started = process.threadCpuUsage();
    const code = projectCode(root);
    const migrated = migrateCode(code, MIGRATIONS);
    const spent = process.threadCpuUsage(started);

    expect(code.files).toHaveLength(FILES);
    expect(migrated.edits).toHaveLength(FILES / 10);
    expect((spent.user + spent.system) / 1000).toBeLessThan(2 * BUDGET_MS);
  });
});
