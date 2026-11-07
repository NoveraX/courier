import { sep } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

import { projectCode } from "../../../src/upgrade/codemod/source-files";
import { projectWith, removeProjects } from "../../helpers/temp-project";

/* A folder the walk may not open, as one the system's rights keep from the user, on every system and for root too. */
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  const readdirSync = ((path: string, options: never) => {
    if (String(path).endsWith(`${sep}locked`))
      throw Object.assign(new Error("EACCES: permission denied, scandir"), { code: "EACCES" });
    return fs.readdirSync(path, options);
  }) as typeof fs.readdirSync;
  return { ...fs, readdirSync };
});

afterAll(removeProjects);

describe("projectCode, where a folder will not open", () => {
  it("names the folder and walks the rest", () => {
    const root = projectWith({
      "locked/api.ts": 'import { createCaller } from "@noverax/courier";\n',
      "src/api.ts": 'import { createCaller } from "@noverax/courier";\n',
    });

    const code = projectCode(root);

    expect(code.paths).toEqual(["src/api.ts"]);
    expect(code.unread).toEqual([
      { path: "locked", why: "it could not be opened (EACCES)", folder: true },
    ]);
  });
});
