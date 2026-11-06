/**
 * Add to mock on real files: an endpoint a mock leaves to its source's
 * server is appended to the list the mock answers, previewed first and
 * written only as previewed, and the mock loaded again lists it; one the
 * mock answers already, or its source does not have, is refused, and a mock
 * that answers every endpoint, or one Studio cannot read, is left to the
 * developer with the names to add.
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type LoadedCourierConfig, loadCourierConfig } from "../../src/server/config-loader";
import type { ExclusiveTransaction } from "../../src/server/exclusive-context";
import { applyEdit } from "../../src/server/mocks-edit/apply-mocks-edit";
import { endpointsRequest } from "../../src/server/mocks-edit/endpoints-request";
import type { MocksEditContext } from "../../src/server/mocks-edit/mocks-edit-context";
import { previewEdit } from "../../src/server/mocks-edit/preview-mocks-edit";
import type { ReadyOutcome } from "../../src/server/mocks-edit/types";
import type { ProjectState } from "../../src/server/project-state/types";
import { createUpdateChecks } from "../../src/server/update-checks";

const CACHE = join(__dirname, "../../../../node_modules/.cache/courier-studio-tests");

const SOURCE = [
  'import { courier, defineApi, defineGroup } from "@noverax/courier/define";',
  "const { endpoint } = courier();",
  "export const shop = defineApi({",
  '  baseURL: "https://shop.example",',
  "  groups: {",
  "    orders: defineGroup({",
  '      prefix: "orders",',
  "      endpoints: {",
  '        list: endpoint.get(""),',
  '        refund: endpoint.post(":id/refund"),',
  "      },",
  "    }),",
  "  },",
  "});",
  "",
].join("\n");

function mocks(options: string): string {
  return [
    'import { defineMocks, defineMockServer } from "@noverax/courier-mock";',
    'import courierConfig from "./courier.config";',
    "",
    "export default defineMocks({",
    `  shop: defineMockServer({ source: courierConfig.sources.shop${options} }),`,
    "});",
    "",
  ].join("\n");
}

let root: string;
let current: LoadedCourierConfig;

beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  mkdirSync(CACHE, { recursive: true });
  root = realpathSync(mkdtempSync(join(CACHE, "endpoints-")));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "shop.ts"), SOURCE);
  writeFileSync(
    join(root, "courier.config.ts"),
    'import { shop } from "./src/shop";\nexport default { sources: { shop } };\n',
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

/* A running Studio whose reload chain is free, running the files as they are when it starts. */
async function studio(): Promise<MocksEditContext> {
  current = await loadCourierConfig(root);
  const tx = {
    current: () => current,
    load: () => loadCourierConfig(root),
    apply: (loaded: LoadedCourierConfig) => {
      current = loaded;
    },
    acknowledge: () => undefined,
    reloadAfter: () => undefined,
  };
  const state = () => ({
    revision: 1,
    starting: false,
    running: current,
    loadedAt: 0,
    failure: null,
  });
  const project: ProjectState = {
    snapshot: state,
    fresh: async () => ({ ...state(), settling: false }),
    importsChanged: () => undefined,
    updateChecks: createUpdateChecks(),
    runExclusive: async <TResult>(transaction: ExclusiveTransaction<TResult>) => transaction(tx),
    finishEdits: async () => undefined,
    stop: () => undefined,
  };
  return {
    projectRoot: root,
    mockBasePort: () => 7001,
    project,
    studioPort: () => null,
    mockSummaries: () => [],
  };
}

const asked = (endpoints: string[]) => ({
  key: "shop",
  endpoints,
  baseHash: null,
  planDigest: null,
});

describe("adding an endpoint a mock leaves to its source's server", () => {
  it("previews the edit, writes it as previewed, and runs the mock listing it", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), mocks(', endpoints: ["orders.list"]'));
    const ctx = await studio();

    const preview = (await previewEdit(
      ctx,
      endpointsRequest(ctx, asked(["orders.refund"])),
    )) as ReadyOutcome;
    expect(preview.status).toBe("ready");
    const result = await applyEdit(
      ctx,
      endpointsRequest(ctx, {
        ...asked(["orders.refund"]),
        baseHash: preview.baseHash,
        planDigest: preview.planDigest,
      }),
    );

    expect(result).toEqual({
      status: "applied",
      target: "courier.mocks.ts",
      keys: ["shop"],
      warnings: [],
    });
    expect(readFileSync(join(root, "courier.mocks.ts"), "utf8")).toBe(
      mocks(', endpoints: ["orders.list", "orders.refund"]'),
    );
    expect(Reflect.get(current.mocks.entries.shop as object, "endpoints")).toEqual([
      "orders.list",
      "orders.refund",
    ]);
  });

  it("writes nothing when the file changed after the preview, and shows the plan again", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), mocks(', endpoints: ["orders.list"]'));
    const ctx = await studio();
    const preview = (await previewEdit(
      ctx,
      endpointsRequest(ctx, asked(["orders.refund"])),
    )) as ReadyOutcome;
    writeFileSync(
      join(root, "courier.mocks.ts"),
      mocks(', endpoints: ["orders.list"], port: 7400'),
    );

    const result = await applyEdit(
      ctx,
      endpointsRequest(ctx, {
        ...asked(["orders.refund"]),
        baseHash: preview.baseHash,
        planDigest: preview.planDigest,
      }),
    );

    expect(result.status).toBe("stale");
    expect(readFileSync(join(root, "courier.mocks.ts"), "utf8")).toBe(
      mocks(', endpoints: ["orders.list"], port: 7400'),
    );
  });
});

describe("an endpoint Studio does not add", () => {
  it.each([
    ["one the mock answers already", ["orders.list"]],
    ["one the source does not have", ["orders.void"]],
  ])("refuses %s", async (_, endpoints) => {
    writeFileSync(join(root, "courier.mocks.ts"), mocks(', endpoints: ["orders.list"]'));
    const ctx = await studio();

    const preview = await previewEdit(ctx, endpointsRequest(ctx, asked(endpoints)));

    expect(preview).toMatchObject({
      status: "invalid",
      errors: [{ field: "endpoints", source: "shop" }],
    });
  });

  it("leaves a mock that answers every endpoint to the developer", async () => {
    writeFileSync(join(root, "courier.mocks.ts"), mocks(""));
    const ctx = await studio();

    const preview = await previewEdit(ctx, endpointsRequest(ctx, asked(["orders.refund"])));

    expect(preview).toMatchObject({ status: "invalid", errors: [{ field: "endpoints" }] });
  });

  it("leaves a list Studio cannot read to the developer, with the names to add", async () => {
    writeFileSync(
      join(root, "courier.mocks.ts"),
      mocks(", endpoints: picked").replace(
        "export default",
        'const picked = ["orders.list"];\nexport default',
      ),
    );
    const ctx = await studio();

    const preview = await previewEdit(ctx, endpointsRequest(ctx, asked(["orders.refund"])));

    expect(preview).toMatchObject({
      status: "manual",
      target: "courier.mocks.ts",
      reasons: [{ code: "ENDPOINTS_NOT_LITERAL" }],
    });
    expect(preview.status === "manual" && preview.snippet).toContain('"orders.refund",');
  });
});
