/**
 * "Watching N" in Studio's status bar. A config that failed to load arms a
 * watch on every name a config or a mocks file could have, so that creating
 * one is noticed — and those names counted as files watched, most of them
 * files that do not exist.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { armWatchSet } from "../src/server/arm-watch-set";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "courier-arm-watch-")));
  roots.push(root);
  return root;
}

describe("the number of files Studio says it watches", () => {
  it("counts only the files there are after a load that failed", () => {
    const root = project();
    const config = join(root, "courier.config.ts");
    writeFileSync(config, "export default {\n");
    const setApiPathCount = vi.fn();
    const watchSet = { update: vi.fn() };
    const arming = armWatchSet(watchSet, { projectRoot: root, watcherStatus: { setApiPathCount } });

    arming.failed(new Map([[config, "abc"]]), new SyntaxError("Unexpected end of input"));

    const [watched] = watchSet.update.mock.calls.at(-1) ?? [];
    expect(watched.length).toBeGreaterThan(1);
    expect(setApiPathCount).toHaveBeenLastCalledWith(1);
  });
});
