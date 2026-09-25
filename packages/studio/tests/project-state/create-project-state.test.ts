/**
 * The owner of the project gives up a first load that never finishes: Studio
 * is then failed with `CONFIG_LOAD_TIMEOUT`, and every UI is told so, rather
 * than being left starting for good. Finishing edits, as Studio does when it
 * stops, refuses an edit still queued rather than waiting for it.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "socket.io";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BindingTable } from "../../src/server/catalog/binding-table";
import { createMockRegistry } from "../../src/server/mock-registry";
import { createProjectState } from "../../src/server/project-state/create-project-state";
import type { ProjectState } from "../../src/server/project-state/types";
import { clearStartupIssues } from "../../src/server/startup-issues";
import { createWatcherStatus } from "../../src/server/watcher-status";

let root: string;
/* Never attached to an HTTP server, so it holds nothing to close. */
let io: Server;
let project: ProjectState | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HANGS = "await new Promise(() => {})\nexport default { sources: {} }\n";

async function until(condition: () => boolean, budgetMs = 5000): Promise<void> {
  for (let waited = 0; waited < budgetMs && !condition(); waited += 25) await sleep(25);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "create-project-state-")));
  io = new Server();
});

afterEach(() => {
  project?.stop();
  project = null;
  clearStartupIssues();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("createProjectState", () => {
  it("a first load that never finishes leaves Studio failed with the timeout, not starting forever", async () => {
    writeFileSync(join(root, "courier.config.ts"), HANGS);
    const uiNamespace = io.of("/ui");
    const emit = vi.spyOn(uiNamespace, "emit");
    const statuses = () =>
      emit.mock.calls.filter(([event]) => event === "config:status").map(([, payload]) => payload);

    project = createProjectState({
      projectRoot: root,
      bindingTable: new BindingTable(),
      uiNamespace,
      watcherStatus: createWatcherStatus(uiNamespace),
      mocks: { mockRegistry: createMockRegistry(), mockManager: { setMocksFile: vi.fn() } },
      loadTimeoutMs: 300,
    });
    await until(() => statuses().length > 0);

    expect(project.snapshot()).toMatchObject({ starting: false, failure: { code: "CONFIG_LOAD_TIMEOUT" } });
    expect(statuses()).toHaveLength(1);
    const [status] = statuses();
    expect(status).toMatchObject({ state: "failed", configFile: null, error: { code: "CONFIG_LOAD_TIMEOUT" } });
    expect(isRecord(status) && isRecord(status.error) && status.error.message).toContain(
      "COURIER_CONFIG_LOAD_TIMEOUT_MS",
    );
  });

  it("finishing edits refuses one queued behind a load that hangs at once, and it never runs", async () => {
    writeFileSync(join(root, "courier.config.ts"), HANGS);
    const uiNamespace = io.of("/ui");
    project = createProjectState({
      projectRoot: root,
      bindingTable: new BindingTable(),
      uiNamespace,
      watcherStatus: createWatcherStatus(uiNamespace),
      mocks: { mockRegistry: createMockRegistry(), mockManager: { setMocksFile: vi.fn() } },
      loadTimeoutMs: 1000,
    });
    const transaction = vi.fn(async () => "edited");
    const edit = project.runExclusive(transaction, 1000);
    edit.catch(() => undefined);

    const started = Date.now();
    await project.finishEdits(6000);
    const tookMs = Date.now() - started;

    expect(tookMs).toBeLessThan(500);
    await expect(edit).rejects.toMatchObject({ code: "CONFIG_WATCHER_STOPPED" });
    await project.settled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
