/**
 * The apply transaction on real files, with the load after the write under
 * the test's control: an edit that does not load, or loads as something
 * other than the edit, is taken back and Studio is left as it was; a file
 * the developer saved meanwhile is left alone; a plan that is not the one
 * previewed writes nothing; only an accepted load is applied.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ReplaceModule from "../../src/server/mocks-edit/replace-mocks-file";

const writes = vi.hoisted(() => ({ failNext: null as unknown }));

vi.mock("../../src/server/mocks-edit/replace-mocks-file", async (importOriginal) => {
  const actual = await importOriginal<typeof ReplaceModule>();
  return {
    replaceMocksFile: (...args: Parameters<typeof actual.replaceMocksFile>) => {
      const failure = writes.failNext;
      writes.failNext = null;
      if (failure) throw failure;
      actual.replaceMocksFile(...args);
    },
  };
});

import { type LoadedCourierConfig, loadCourierConfig } from "../../src/server/config-loader";
import type { ExclusiveContext, ExclusiveTransaction } from "../../src/server/exclusive-reload";
import { MocksFileChangedError } from "../../src/server/mocks-edit/mocks-file-changed-error";
import { applyMocksEdit } from "../../src/server/mocks-edit/apply-mocks-edit";
import type { MocksEditContext } from "../../src/server/mocks-edit/mocks-edit-context";
import { previewMocksEdit } from "../../src/server/mocks-edit/preview-mocks-edit";
import type { ReadyOutcome } from "../../src/server/mocks-edit/types";
import { ACT_BUDGET_MS, CONFIG_LOAD_TIMEOUT_MS } from "../../src/server/project-state/budgets";
import type { ProjectState } from "../../src/server/project-state/types";

const CACHE = join(__dirname, "../../../../node_modules/.cache/courier-studio-tests");
const EXISTING =
  'import { defineMocks, defineMockServer } from "@noverax/courier-mock";\n' +
  'import courierConfig from "./courier.config";\n\n' +
  "export default defineMocks({\n" +
  "  first: defineMockServer({ source: courierConfig.sources.api }),\n" +
  "});\n";

let root: string;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mkdirSync(CACHE, { recursive: true });
  root = realpathSync(mkdtempSync(join(CACHE, "apply-")));
  mkdirSync(join(root, "src"));
  writeFileSync(
    join(root, "src", "api.ts"),
    'import { defineApi } from "@noverax/courier/define";\nexport const api = defineApi({ baseURL: "https://api.example", endpoints: {} });\n',
  );
  writeFileSync(join(root, "courier.config.ts"), 'import { api } from "./src/api";\nexport default { sources: { api } };\n');
});

afterEach(() => {
  vi.useRealTimers();
  writes.failNext = null;
  vi.restoreAllMocks();
  chmodSync(root, 0o755);
  rmSync(root, { recursive: true, force: true });
});

interface Harness {
  ctx: MocksEditContext;
  tx: ExclusiveContext & {
    apply: ReturnType<typeof vi.fn>;
    acknowledge: ReturnType<typeof vi.fn>;
    reloadAfter: ReturnType<typeof vi.fn>;
  };
  /** Holds the reload chain until the returned function is called. */
  holdSlot(): () => void;
  /** Has Studio run the files as they are now, as the watcher would after a save. */
  reload(): Promise<void>;
}

/* A project that runs the transaction when its slot is free, with a load the test decides. */
async function harness(load: (real: () => Promise<LoadedCourierConfig>) => Promise<LoadedCourierConfig>): Promise<Harness> {
  let current = await loadCourierConfig(root);
  let slotFree: Promise<void> = Promise.resolve();
  const tx = {
    current: () => current,
    load: () => load(() => loadCourierConfig(root)),
    apply: vi.fn((loaded: LoadedCourierConfig) => {
      current = loaded;
    }),
    acknowledge: vi.fn(),
    reloadAfter: vi.fn(),
  };
  const project: ProjectState = {
    snapshot: () => ({ revision: 1, starting: false, running: current, loadedAt: 0, failure: null }),
    fresh: async () => ({ revision: 1, starting: false, running: current, loadedAt: 0, failure: null, settling: false }),
    runExclusive: async <TResult>(transaction: ExclusiveTransaction<TResult>) => {
      await slotFree;
      return transaction(tx);
    },
    finishEdits: async () => undefined,
    stop: () => undefined,
  };
  const ctx: MocksEditContext = {
    projectRoot: root,
    mockBasePort: 7001,
    project,
    studioPort: () => null,
    mockSummaries: () => [],
  };
  const holdSlot = () => {
    let release = () => {};
    slotFree = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  };
  const reload = async () => {
    current = await loadCourierConfig(root);
  };
  return { ctx, tx, holdSlot, reload };
}

const request = { key: "second", source: "api", port: null, seedCount: 20, autoStart: false };

async function confirmed(ctx: MocksEditContext) {
  const preview = (await previewMocksEdit(ctx, [request])) as ReadyOutcome;
  expect(preview.status).toBe("ready");
  return { mocks: [request], baseHash: preview.baseHash, planDigest: preview.planDigest };
}

describe("applyMocksEdit", () => {
  it("applies an accepted load once, and acknowledges its own write", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), EXISTING);
    const { ctx, tx } = await harness((real) => real());

    const result = await applyMocksEdit(ctx, await confirmed(ctx));

    expect(result).toEqual({ status: "applied", target: "courier.mocks.ts", keys: ["second"], warnings: [] });
    expect(tx.apply).toHaveBeenCalledTimes(1);
    expect(tx.acknowledge).toHaveBeenCalledWith([join(root, "courier.mocks.ts")]);
  });

  it("takes back an edit whose files do not load, restoring the exact bytes and mode, and applies nothing", async () => {
    const file = join(root, "courier.mocks.ts");
    writeFileSync(file, EXISTING);
    chmodSync(file, 0o664);
    const { ctx, tx } = await harness(async () => {
      throw new Error("Unexpected token");
    });

    const result = await applyMocksEdit(ctx, await confirmed(ctx));

    expect(result).toMatchObject({ status: "rolledBack", target: "courier.mocks.ts", creates: false });
    expect(String((result as { reason: string }).reason)).toContain("Unexpected token");
    expect((result as { snippet: string }).snippet).toContain("second: defineMockServer({ source: courierConfig.sources.api })");
    expect(readFileSync(file, "utf8")).toBe(EXISTING);
    expect(statSync(file).mode & 0o777).toBe(0o664);
    expect(tx.apply).not.toHaveBeenCalled();
    expect(tx.acknowledge).toHaveBeenCalledTimes(2);
  });

  it("takes back a load that is not the edit — the requested mock missing", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), EXISTING);
    const { ctx, tx } = await harness(async (real) => {
      const loaded = await real();
      delete loaded.mocks.entries.second;
      return loaded;
    });

    const result = await applyMocksEdit(ctx, await confirmed(ctx));

    expect(result).toMatchObject({ status: "rolledBack", reason: "second is not declared after the edit" });
    expect(readFileSync(join(root, "courier.mocks.ts"), "utf8")).toBe(EXISTING);
    expect(tx.apply).not.toHaveBeenCalled();
  });

  it("takes back an edit whose load Studio could not run, restoring the file it ran", async () => {
    const file = join(root, "courier.mocks.ts");
    writeFileSync(file, EXISTING);
    const { ctx, tx } = await harness((real) => real());
    tx.apply.mockImplementationOnce(() => {});

    const result = await applyMocksEdit(ctx, await confirmed(ctx));

    expect(tx.apply).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "rolledBack",
      target: "courier.mocks.ts",
      reason: "the edited files loaded, but Studio could not run them; the terminal says why",
    });
    expect(readFileSync(file, "utf8")).toBe(EXISTING);
  });

  it("removes a file it created when the edit is taken back", async () => {
    const { ctx } = await harness(async () => {
      throw new Error("Cannot find module");
    });

    const result = await applyMocksEdit(ctx, await confirmed(ctx));

    expect(result).toMatchObject({ status: "rolledBack", creates: true });
    expect(existsSync(join(root, "courier.mocks.ts"))).toBe(false);
  });

  it("leaves a file the developer saved meanwhile, and names the lines it added", async () => {
    const file = join(root, "courier.mocks.ts");
    writeFileSync(file, EXISTING);
    const { ctx, tx } = await harness(async () => {
      writeFileSync(file, `${readFileSync(file, "utf8")}// saved meanwhile\n`);
      throw new Error("Unexpected token");
    });

    const result = await applyMocksEdit(ctx, await confirmed(ctx));

    expect(result).toMatchObject({
      status: "notVerified",
      insertedLines: [
        {
          line: 6,
          text: "  second: defineMockServer({ source: courierConfig.sources.api }),",
          added: "  second: defineMockServer({ source: courierConfig.sources.api }),",
        },
      ],
    });
    expect(readFileSync(file, "utf8")).toContain("// saved meanwhile");
    expect(tx.apply).not.toHaveBeenCalled();
    expect(tx.reloadAfter).toHaveBeenCalledWith([file]);
  });

  it.skipIf(process.getuid?.() === 0)("says so when it cannot take its edit back, and has the file reloaded", async () => {
    const file = join(root, "courier.mocks.ts");
    writeFileSync(file, EXISTING);
    const { ctx, tx } = await harness(async () => {
      chmodSync(root, 0o555);
      throw new Error("Unexpected token");
    });

    const result = await applyMocksEdit(ctx, await confirmed(ctx));

    chmodSync(root, 0o755);
    expect(result).toMatchObject({ status: "rollbackFailed", insertedLines: [{ line: 6 }] });
    expect(tx.reloadAfter).toHaveBeenCalledWith([file]);
  });

  it("writes nothing for a plan other than the one previewed", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), EXISTING);
    const { ctx, tx } = await harness((real) => real());
    const body = await confirmed(ctx);

    const result = await applyMocksEdit(ctx, { ...body, planDigest: "0".repeat(64) });

    expect(result.status).toBe("stale");
    expect((result as { plan: { status: string } }).plan.status).toBe("ready");
    expect(readFileSync(join(root, "courier.mocks.ts"), "utf8")).toBe(EXISTING);
    expect(tx.acknowledge).not.toHaveBeenCalled();
  });

  it("writes nothing for a preview of another file version", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), EXISTING);
    const { ctx } = await harness((real) => real());
    const body = await confirmed(ctx);

    const result = await applyMocksEdit(ctx, { ...body, baseHash: "f".repeat(64) });

    expect(result.status).toBe("stale");
    expect(readFileSync(join(root, "courier.mocks.ts"), "utf8")).toBe(EXISTING);
  });

  it("answers a save made after the preview with the plan against the file as saved, writing nothing", async () => {
    const file = join(root, "courier.mocks.ts");
    writeFileSync(file, EXISTING);
    const { ctx, tx } = await harness((real) => real());
    const body = await confirmed(ctx);
    const saved = EXISTING.replace("export default", "// saved\nexport default");
    writeFileSync(file, saved);

    const result = await applyMocksEdit(ctx, body);

    expect(result.status).toBe("stale");
    expect((result as { plan: { status: string } }).plan.status).toBe("ready");
    expect(readFileSync(file, "utf8")).toBe(saved);
    expect(tx.apply).toHaveBeenCalledTimes(1);
  });

  it("answers stale when the file changes between the plan and the write", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), EXISTING);
    const { ctx } = await harness((real) => real());
    const body = await confirmed(ctx);
    writes.failNext = new MocksFileChangedError(join(root, "courier.mocks.ts"));

    const result = await applyMocksEdit(ctx, body);

    expect(result.status).toBe("stale");
    expect(readFileSync(join(root, "courier.mocks.ts"), "utf8")).toBe(EXISTING);
  });

  it("leaves the mocks to the developer when the file cannot be written, naming it relative to the project", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), EXISTING);
    const { ctx, tx } = await harness((real) => real());
    const body = await confirmed(ctx);
    writes.failNext = Object.assign(new Error(`EACCES: permission denied, open '${root}/.courier.mocks.1-abc.tmp'`), { code: "EACCES" });

    const result = await applyMocksEdit(ctx, body);

    expect(result).toMatchObject({ status: "manual", target: "courier.mocks.ts", creates: false, reasons: [{ code: "WRITE_FAILED" }] });
    const [reason] = (result as { reasons: Array<{ message: string }> }).reasons;
    expect(reason?.message).toBe(
      "Studio could not write courier.mocks.ts (EACCES: permission denied, open '.courier.mocks.1-abc.tmp').",
    );
    expect(tx.acknowledge).not.toHaveBeenCalled();
  });

  it("tells the wizard Studio is busy when the reload chain stays taken, and then changes nothing", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), EXISTING);
    const { ctx, tx, holdSlot } = await harness((real) => real());
    const body = await confirmed(ctx);
    const release = holdSlot();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const pending = applyMocksEdit(ctx, body);
    await vi.advanceTimersByTimeAsync(ACT_BUDGET_MS);
    const result = await pending;
    release();
    await vi.runAllTimersAsync();

    expect(result).toMatchObject({ status: "manual", retryable: true, reasons: [{ code: "STUDIO_BUSY" }] });
    expect(readFileSync(join(root, "courier.mocks.ts"), "utf8")).toBe(EXISTING);
    expect(tx.acknowledge).not.toHaveBeenCalled();
  });

  it("waits out a load ahead of it that holds the chain for as long as one load may take, and then applies", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), EXISTING);
    const { ctx, holdSlot } = await harness((real) => real());
    const body = await confirmed(ctx);
    const release = holdSlot();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const pending = applyMocksEdit(ctx, body);
    await vi.advanceTimersByTimeAsync(CONFIG_LOAD_TIMEOUT_MS);
    vi.useRealTimers();
    release();
    const result = await pending;

    expect(result).toMatchObject({ status: "applied", keys: ["second"] });
  });

  it("answers a save Studio already runs with the plan against it, without loading it again", async () => {
    const file = join(root, "courier.mocks.ts");
    writeFileSync(file, EXISTING);
    const { ctx, tx, reload } = await harness((real) => real());
    const body = await confirmed(ctx);
    writeFileSync(file, EXISTING.replace("export default", "// saved\nexport default"));
    await reload();

    const result = await applyMocksEdit(ctx, body);

    expect(result.status).toBe("stale");
    expect((result as { plan: { status: string } }).plan.status).toBe("ready");
    expect(tx.apply).not.toHaveBeenCalled();
  });

  it.skipIf(process.getuid?.() === 0)("answers a file that became unreadable after the preview without failing", async () => {
    const file = join(root, "courier.mocks.ts");
    writeFileSync(file, EXISTING);
    const { ctx } = await harness((real) => real());
    const body = await confirmed(ctx);
    chmodSync(file, 0o000);

    const result = await applyMocksEdit(ctx, body);

    chmodSync(file, 0o644);
    expect(result.status).toBe("stale");
    expect((result as { plan: { status: string } }).plan.status).toBe("manual");
  });
});
