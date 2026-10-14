/**
 * Writing a routes module: whole and only when it would read otherwise,
 * folders made on the way; only over a file Courier wrote; never through a
 * link out of the project; and a check that writes nothing but says when the
 * file is out of date.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PathOutsideProjectError } from "../../src/project-fs/path-outside-project-error";
import { type ProjectRoot, projectRootAt } from "../../src/project-fs/project-root";
import type { ComposedRoutesModule } from "../../src/routes-module/compose-routes-module";
import { routesModuleText } from "../../src/routes-module/routes-module-text";
import { writeRoutesModule } from "../../src/routes-module/write-routes-module";

let dir: string;
let root: ProjectRoot;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "courier-write-routes-"));
  root = projectRootAt(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function composed(
  path: string,
  endpoints: Record<string, { type: "query" | "mutation" }>,
): ComposedRoutesModule {
  const count = Object.keys(endpoints).length;
  const sources =
    count === 0 ? [] : [{ exportName: "apiRoutes", routes: { source: "api", endpoints } }];
  return {
    path,
    content: routesModuleText({
      configName: "courier.config.ts",
      configSpecifier: "./courier.config",
      sources,
    }),
    sources: sources.map((each) => each.routes.source),
    endpoints: count,
  };
}

describe("writeRoutesModule", () => {
  it("writes the module where there is none, making its folders, and then leaves it be", async () => {
    const module = composed("src/lib/courier.routes.ts", { "users.list": { type: "query" } });

    const first = await writeRoutesModule(root, module);
    const second = await writeRoutesModule(root, module);

    expect(first.status).toBe("written");
    expect(readFileSync(join(dir, "src/lib/courier.routes.ts"), "utf8")).toBe(module.content);
    expect(second.status).toBe("unchanged");
  });

  it("writes the module again when the routes change", async () => {
    await writeRoutesModule(
      root,
      composed("courier.routes.ts", { "users.list": { type: "query" } }),
    );
    const changed = composed("courier.routes.ts", { "users.create": { type: "mutation" } });

    const outcome = await writeRoutesModule(root, changed);

    expect(outcome.status).toBe("written");
    expect(readFileSync(join(dir, "courier.routes.ts"), "utf8")).toContain('"users.create"');
  });

  it("checks without writing: out of date when the file reads otherwise, up to date when not", async () => {
    await writeRoutesModule(
      root,
      composed("courier.routes.ts", { "users.list": { type: "query" } }),
    );
    const before = readFileSync(join(dir, "courier.routes.ts"), "utf8");

    const stale = await writeRoutesModule(
      root,
      composed("courier.routes.ts", { "users.create": { type: "mutation" } }),
      {
        check: true,
      },
    );
    const current = await writeRoutesModule(
      root,
      composed("courier.routes.ts", { "users.list": { type: "query" } }),
      {
        check: true,
      },
    );

    expect(stale.status).toBe("stale");
    expect(readFileSync(join(dir, "courier.routes.ts"), "utf8")).toBe(before);
    expect(current.status).toBe("unchanged");
  });

  it("leaves a file Courier did not write as it is", async () => {
    writeFileSync(join(dir, "routes.ts"), "export const mine = 1;\n");

    const outcome = await writeRoutesModule(
      root,
      composed("routes.ts", { "users.list": { type: "query" } }),
    );

    expect(outcome.status).toBe("foreign");
    expect(readFileSync(join(dir, "routes.ts"), "utf8")).toBe("export const mine = 1;\n");
  });

  it("writes no module while no endpoint is marked, and empties the one written before", async () => {
    const none = await writeRoutesModule(root, composed("courier.routes.ts", {}));
    expect(none.status).toBe("none");
    expect(existsSync(join(dir, "courier.routes.ts"))).toBe(false);

    await writeRoutesModule(
      root,
      composed("courier.routes.ts", { "users.list": { type: "query" } }),
    );
    const emptied = await writeRoutesModule(root, composed("courier.routes.ts", {}));

    expect(emptied.status).toBe("written");
    expect(readFileSync(join(dir, "courier.routes.ts"), "utf8")).toContain("export {};");
  });

  it("refuses a module a link would put outside the project", async () => {
    const outside = mkdtempSync(join(tmpdir(), "courier-write-routes-outside-"));
    try {
      symlinkSync(outside, join(dir, "src"), "dir");
      mkdirSync(join(outside, "lib"));

      await expect(
        writeRoutesModule(
          root,
          composed("src/lib/courier.routes.ts", { "users.list": { type: "query" } }),
        ),
      ).rejects.toBeInstanceOf(PathOutsideProjectError);
      expect(existsSync(join(outside, "lib", "courier.routes.ts"))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
