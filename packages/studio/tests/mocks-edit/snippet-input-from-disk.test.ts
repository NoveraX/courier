/**
 * What a snippet is built from before Studio has planned an edit: the
 * project's mocks file when it has one — its text when it can be read — or a
 * new file beside the config.
 */
import { chmodSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { snippetInputFromDisk } from "../../src/server/mocks-edit/snippet-input-from-disk";
import { snippetInputUnread } from "../../src/server/mocks-edit/snippet-input-unread";

let root: string;
const requests = [{ key: "apiMock", source: "api", port: null, seedCount: 20, autoStart: false }];

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-snippet-input-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("snippetInputFromDisk", () => {
  it("reads the existing mocks file", () => {
    writeFileSync(join(root, "courier.config.mts"), "export default {};\n");
    writeFileSync(join(root, "courier.mocks.mts"), "export default {};\n");

    expect(snippetInputFromDisk(root, requests)).toEqual({
      existing: { name: "courier.mocks.mts", text: "export default {};\n" },
      createName: "courier.mocks.mts",
      configName: "courier.config.mts",
      configText: null,
      explicitExtensions: false,
      requests,
    });
  });

  /* Windows keeps no read permission in a file's mode. */
  it.skipIf(process.getuid?.() === 0 || process.platform === "win32")(
    "names an existing file it cannot read, without its text",
    () => {
      writeFileSync(join(root, "courier.mocks.ts"), "export default {};\n");
      chmodSync(join(root, "courier.mocks.ts"), 0o000);

      const input = snippetInputFromDisk(root, requests);

      chmodSync(join(root, "courier.mocks.ts"), 0o644);
      expect(input.existing).toEqual({ name: "courier.mocks.ts", text: null });
    },
  );

  it("names a link without reading through it", () => {
    writeFileSync(join(root, "elsewhere.ts"), "export default {};\n");
    symlinkSync(join(root, "elsewhere.ts"), join(root, "courier.mocks.ts"));

    expect(snippetInputFromDisk(root, requests).existing).toEqual({
      name: "courier.mocks.ts",
      text: null,
    });
  });

  it("creates a file beside the config when there is none, named after its flavour", () => {
    writeFileSync(join(root, "courier.config.mts"), "export default {};\n");

    expect(snippetInputFromDisk(root, requests)).toMatchObject({
      existing: null,
      createName: "courier.mocks.mts",
      configName: "courier.config.mts",
    });
  });

  it("assumes courier.config.ts when the project has no config", () => {
    expect(snippetInputFromDisk(root, requests)).toMatchObject({
      existing: null,
      createName: "courier.mocks.ts",
      configName: "courier.config.ts",
    });
  });

  it("names extensions in a type module project that resolves modules as Node does, as the edit would", () => {
    writeFileSync(join(root, "package.json"), '{ "type": "module" }');
    writeFileSync(join(root, "tsconfig.json"), '{ "compilerOptions": { "module": "NodeNext" } }');
    writeFileSync(join(root, "courier.config.ts"), "export default {};\n");

    expect(snippetInputFromDisk(root, requests)).toMatchObject({
      existing: null,
      createName: "courier.mocks.ts",
      explicitExtensions: true,
    });
  });

  it("names extensions where the config's own relative imports carry them", () => {
    writeFileSync(
      join(root, "courier.config.ts"),
      'import { api } from "./src/api.js";\nexport default { sources: { api } };\n',
    );
    writeFileSync(join(root, "courier.mocks.ts"), "export default {};\n");

    expect(snippetInputFromDisk(root, requests)).toMatchObject({
      createName: "courier.mocks.ts",
      explicitExtensions: true,
    });
  });
});

describe("snippetInputUnread", () => {
  it("names a mocks file without reading anything", () => {
    expect(snippetInputUnread(requests).existing).toEqual({ name: "courier.mocks.ts", text: null });
  });

  it("names no extensions, having read nothing to tell", () => {
    expect(snippetInputUnread(requests).explicitExtensions).toBe(false);
  });
});
