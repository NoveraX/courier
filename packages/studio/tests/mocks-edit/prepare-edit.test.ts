/**
 * Planning an edit against what Studio runs: every refusal that comes before
 * the mocks file is planned still names that file and gives only the lines
 * to add — never a whole new file that would replace the mocks it declares.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type LoadedCourierConfig, loadCourierConfig } from "../../src/server/config-loader";
import type { MocksEditContext } from "../../src/server/mocks-edit/mocks-edit-context";
import { prepareEdit } from "../../src/server/mocks-edit/prepare-edit";
import type { ManualOutcome } from "../../src/server/mocks-edit/types";

const CACHE = join(__dirname, "../../../../node_modules/.cache/courier-studio-tests");
const EXISTING =
  'import { defineMocks, defineMockServer } from "@noverax/courier-mock";\n' +
  'import courierConfig from "./courier.config";\n\n' +
  "export default defineMocks({\n" +
  "  first: defineMockServer({ source: courierConfig.sources.api }),\n" +
  "});\n";

let root: string;

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  mkdirSync(CACHE, { recursive: true });
  root = realpathSync(mkdtempSync(join(CACHE, "prepare-")));
  mkdirSync(join(root, "src"));
  writeFileSync(
    join(root, "src", "api.ts"),
    'import { defineApi } from "@noverax/courier/define";\nexport const api = defineApi({ baseURL: "https://api.example", endpoints: {} });\n',
  );
  writeFileSync(join(root, "courier.config.ts"), 'import { api } from "./src/api";\nexport default { sources: { api } };\n');
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

const ctx = (): MocksEditContext => ({
  projectRoot: root,
  mockBasePort: 7001,
  watcher: () => null,
  studioPort: () => null,
  mockSummaries: () => [],
});

const request = { key: "second", source: "api", port: null, seedCount: 20, autoStart: false };

function manual(outcome: unknown): ManualOutcome {
  expect(outcome).toMatchObject({ status: "manual" });
  return outcome as ManualOutcome;
}

describe("prepareEdit, when Studio stops before planning", () => {
  it("names the existing mocks file and gives only the lines to add while the config does not load", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), EXISTING);

    const outcome = manual(await prepareEdit(ctx(), { current: null, lastLoadError: new Error("Cannot find module ./src/gone") }, [request]));

    expect(outcome).toMatchObject({ target: "courier.mocks.ts", creates: false, retryable: true, reasons: [{ code: "CONFIG_LOAD_FAILING" }] });
    expect(outcome.snippet).not.toContain("export default");
    expect(outcome.snippet).toContain("second: defineMockServer({ source: courierConfig.sources.api })");
  });

  it("names the existing mocks file while it does not load, relative to the project", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), EXISTING);
    const loaded = await loadCourierConfig(root);
    const broken: LoadedCourierConfig = {
      ...loaded,
      mocks: { ...loaded.mocks, error: new Error(`ParseError: Unexpected token \n ${root}/courier.mocks.ts:3:2`) },
    };

    const outcome = manual(await prepareEdit(ctx(), { current: broken, lastLoadError: null }, [request]));

    expect(outcome).toMatchObject({ target: "courier.mocks.ts", creates: false, reasons: [{ code: "MOCKS_LOAD_FAILING" }] });
    expect(outcome.reasons[0]?.message).toBe(
      "courier.mocks.ts does not load right now (ParseError: Unexpected token courier.mocks.ts:3:2). Fix that first.",
    );
    expect(outcome.snippet).not.toContain("export default");
  });

  it("names a JavaScript mocks file it will not edit, and gives lines to add to it", async () => {
    writeFileSync(join(root, "courier.mocks.js"), EXISTING);
    const loaded = await loadCourierConfig(root);

    const outcome = manual(await prepareEdit(ctx(), { current: loaded, lastLoadError: null }, [request]));

    expect(outcome).toMatchObject({ target: "courier.mocks.js", creates: false, reasons: [{ code: "MOCKS_JAVASCRIPT" }] });
    expect(outcome.snippet).not.toContain("export default");
  });

  it("gives a whole new file only when the project has none", async () => {
    const outcome = manual(await prepareEdit(ctx(), { current: null, lastLoadError: null }, [request]));

    expect(outcome).toMatchObject({ target: null, creates: true, reasons: [{ code: "NO_CONFIG" }] });
    expect(outcome.snippet).toContain("export default defineMocks({");
  });
});

describe("prepareEdit, against what Studio runs", () => {
  it("refuses, retryably, while Studio runs another version of the file than the one on disk", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), EXISTING);
    const loaded = await loadCourierConfig(root);
    writeFileSync(join(root, "courier.mocks.ts"), `${EXISTING}// saved\n`);

    const outcome = manual(await prepareEdit(ctx(), { current: loaded, lastLoadError: null }, [request]));

    expect(outcome).toMatchObject({ retryable: true, reasons: [{ code: "MOCKS_CHANGED_SINCE_LOAD" }] });
  });

  it("refuses a file whose mocks are not all written in the object it would add to", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), EXISTING);
    const loaded = await loadCourierConfig(root);
    const hidden: LoadedCourierConfig = { ...loaded, mocks: { ...loaded.mocks, entries: { ...loaded.mocks.entries, added: {} } } };

    const outcome = manual(await prepareEdit(ctx(), { current: hidden, lastLoadError: null }, [request]));

    expect(outcome).toMatchObject({ creates: false, reasons: [{ code: "MOCKS_KEYS_HIDDEN" }] });
    expect(outcome.reasons[0]?.message).toContain("added");
  });

  it("reports a source the config does not declare on its field", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), EXISTING);
    const loaded = await loadCourierConfig(root);

    const outcome = await prepareEdit(ctx(), { current: loaded, lastLoadError: null }, [{ ...request, source: "billing" }]);

    expect(outcome).toMatchObject({ status: "invalid", errors: [{ index: 0, source: "billing", field: "source" }] });
  });

  it("plans the edit when Studio runs the file as it is", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), EXISTING);
    const loaded = await loadCourierConfig(root);

    const outcome = await prepareEdit(ctx(), { current: loaded, lastLoadError: null }, [request]);

    expect(outcome).toMatchObject({ status: "prepared", baseHash: loaded.mocks.contentHash });
  });
});
