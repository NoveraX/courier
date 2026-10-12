/**
 * Courier File Icons started: its commands registered, and the Courier
 * extension told that they are there.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type * as vscode from "vscode";

import { activate } from "../src/extension";
import { executed, registered, Uri } from "./vscode-stand-in";

describe("Courier File Icons started", () => {
  it("registers its commands and says they are there", () => {
    const root = mkdtempSync(join(tmpdir(), "courier-start-"));
    const context = {
      extensionPath: root,
      globalStorageUri: Uri.file(join(root, "storage")),
      globalState: { get: (_key: string, fallback?: unknown) => fallback, update: async () => {} },
      subscriptions: [] as { dispose(): unknown }[],
    };

    activate(context as unknown as vscode.ExtensionContext);

    expect([...registered.keys()]).toEqual(["courier.fileIcons.show", "courier.fileIcons.remove"]);
    expect(executed).toContainEqual(["setContext", "courier.fileIconsReady", true]);
    for (const each of context.subscriptions) each.dispose();
  });
});
