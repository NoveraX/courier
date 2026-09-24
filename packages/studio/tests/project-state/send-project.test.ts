/**
 * What a UI is sent of the project, and in what order: the imports list and
 * the source catalogue first, the status last; only the status while Studio
 * starts; and the status even when the lists cannot be built.
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CourierConfig } from "@noverax/courier/config";
import type { AnySource } from "@noverax/courier/define";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LoadedCourierConfig } from "../../src/server/config-loader";
import { sendProject } from "../../src/server/project-state/send-project";
import type { ProjectSnapshot } from "../../src/server/project-state/types";

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-send-project-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function loadedWith(config: CourierConfig): LoadedCourierConfig {
  return {
    config,
    configFile: join(root, "courier.config.ts"),
    contentHash: null,
    deps: [],
    mocks: { file: null, entries: {}, contentHash: null, error: null },
  };
}

function snapshotOf(running: LoadedCourierConfig): ProjectSnapshot {
  return { revision: 1, starting: false, running, loadedAt: 1_000, failure: null };
}

function recorder() {
  const sent: Array<[string, unknown]> = [];
  return { sent, target: { emit: (event: string, payload: unknown) => sent.push([event, payload]) } };
}

describe("sendProject", () => {
  it("sends the imports list and the sources, then the status", () => {
    const { sent, target } = recorder();
    const config: CourierConfig = {
      sources: {},
      imports: { remote: { importType: "url", type: "openapi", from: "https://specs.example/a.json", outputDir: "src/gen" } },
    };

    sendProject(target, snapshotOf(loadedWith(config)), root);

    expect(sent.map(([event]) => event)).toEqual(["registry:updated", "scan:sources", "config:status"]);
    expect(sent[0]?.[1]).toMatchObject({ sources: [{ name: "remote", specUrl: "https://specs.example/a.json" }] });
    expect(sent[2]?.[1]).toMatchObject({ state: "loaded", configFile: "courier.config.ts" });
  });

  it("sends only the status while Studio starts", () => {
    const { sent, target } = recorder();

    sendProject(target, { revision: 0, starting: true, running: null, loadedAt: null, failure: null }, root);

    expect(sent).toEqual([["config:status", { state: "starting", revision: 0 }]]);
  });

  it("still sends the status when the lists cannot be built, and says why", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sent, target } = recorder();
    const unreadable: CourierConfig = {
      get sources(): Record<string, AnySource> {
        throw new Error("the sources could not be read");
      },
    };

    sendProject(target, snapshotOf(loadedWith(unreadable)), root);

    expect(sent.map(([event]) => event)).toEqual(["config:status"]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[1])).toContain("Studio could not send the imports and sources to the UI");
  });
});
