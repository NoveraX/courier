/**
 * The editor extensions reach the marketplaces in an order each can be
 * installed in, from the packages their own `package` scripts write, and a
 * version a marketplace already has is passed over, so a release that failed
 * half-way is run again as it is.
 */
import { describe, expect, it } from "vitest";

import { extensionAt, publishCommand, publishingOrder } from "./publish-extensions.ts";
import { extensionDirs } from "./release-order.ts";

const icons = { id: "noverax.courier-file-icons", publisher: "noverax", installs: [] };
const courier = { id: "noverax.courier-vscode", publisher: "noverax", installs: [icons.id] };

describe("an extension", () => {
  it("is read from its manifest: its id, its workspace and where its package goes", () => {
    expect(extensionAt("packages/vscode")).toEqual({
      id: "noverax.courier-vscode",
      publisher: "noverax",
      workspace: "courier-vscode",
      vsix: "packages/vscode/dist/courier.vsix",
      installs: ["noverax.courier-file-icons"],
    });
  });
});

describe("the publishing order", () => {
  it("puts an extension after the ones it installs", () => {
    expect(publishingOrder([courier, icons]).map((each) => each.id)).toEqual([
      icons.id,
      courier.id,
    ]);
  });

  it("publishes Courier File Icons before Courier, which installs it", () => {
    const ordered = publishingOrder(extensionDirs().map(extensionAt));

    expect(ordered.map((each) => each.id)).toEqual([
      "noverax.courier-file-icons",
      "noverax.courier-vscode",
    ]);
  });
});

describe("a publish", () => {
  it("signs in to the Marketplace through Entra ID and passes over a version it has", () => {
    expect(publishCommand("marketplace", "a.vsix")).toEqual([
      "vsce",
      "publish",
      "--azure-credential",
      "--skip-duplicate",
      "--packagePath",
      "a.vsix",
    ]);
  });

  it("passes over a version Open VSX has", () => {
    expect(publishCommand("open-vsx", "a.vsix")).toEqual([
      "ovsx",
      "publish",
      "a.vsix",
      "--skip-duplicate",
    ]);
  });
});
