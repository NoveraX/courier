/**
 * Whether the workspace holds a Courier project: found by the editor's own
 * search once, and searched for again only when a config comes or goes,
 * which is told on.
 */
import { afterEach, describe, expect, it } from "vitest";

import { watchCourierWorkspace } from "../src/courier-workspace";
import { configWatchers, workspaceConfigs } from "./vscode-stand-in";

afterEach(() => {
  workspaceConfigs.length = 0;
  configWatchers.dispose();
});

describe("the workspace, as Courier sees it", () => {
  it("holds a project once a courier.config is found, and is searched again when one comes", async () => {
    const workspace = watchCourierWorkspace();
    let told = 0;
    workspace.onDidChange(() => {
      told += 1;
    });

    const before = await workspace.hasProject();
    workspaceConfigs.push("/work/shop/courier.config.ts");
    const unchanged = await workspace.hasProject();
    configWatchers.fire();
    const after = await workspace.hasProject();

    expect([before, unchanged, after]).toEqual([false, false, true]);
    expect(told).toBe(1);
  });
});
