/**
 * @vitest-environment node
 *
 * What a failed load's error is read for — the module whose transform
 * failed and the place it names, the import that did not resolve and the
 * module that made it — read in time linear in the message, however the
 * message is made: a project's code writes part of it.
 */
import { describe, expect, it } from "vitest";

import { failedTransform, missingImport } from "../../src/config/load-error/read-failure";

const FILE = "/app/src/api.ts";
/* Far below what reading these messages in time quadratic in them takes: seconds. */
const LINEAR_MS = 100;

/* What a reading gave, and how long it took, in milliseconds. */
function timed<T>(read: () => T): { took: number; value: T } {
  const started = performance.now();
  const value = read();
  return { took: performance.now() - started, value };
}

/* What the transformer said of FILE, as the load error reads it. */
function transformSaid(said: string): string | undefined {
  const failures = new Map([[FILE, new SyntaxError(`${FILE}: ${said}`)]]);
  return failedTransform(new Error(`Transform failed for ${FILE}`), failures)?.said;
}

function notFound(message: string): ReturnType<typeof missingImport> {
  return missingImport(Object.assign(new Error(message), { code: "ERR_MODULE_NOT_FOUND" }));
}

describe("what the transformer said", () => {
  it("loses the place it ends with, and the space around it, and nothing else", () => {
    expect(transformSaid("Unexpected token (3:12)")).toBe("Unexpected token");
    expect(transformSaid("Unexpected token \t (3:12) \n")).toBe("Unexpected token");
    expect(transformSaid("Unexpected ( in (1:2) (3:12)")).toBe("Unexpected ( in (1:2)");
    expect(transformSaid("Unexpected ((3:12)")).toBe("Unexpected (");
    expect(transformSaid("(3:12)")).toBe("");
    expect(transformSaid("Missing ) (at 3:12)")).toBe("Missing ) (at 3:12)");
    expect(transformSaid("Unexpected token (3:12)x")).toBe("Unexpected token (3:12)x");
    expect(transformSaid("Unexpected 3:12)")).toBe("Unexpected 3:12)");
    expect(transformSaid("Unexpected token  ")).toBe("Unexpected token  ");
  });

  it("is read in time linear in it, however many spaces it holds", () => {
    const said = `Unexpected token${" ".repeat(60_000)}!`;

    const { took, value } = timed(() => transformSaid(said));

    expect(value).toBe(said);
    expect(took).toBeLessThan(LINEAR_MS);
  });
});

describe("the module that made an import that does not resolve", () => {
  it("is the rest of the line after the first ' imported from ' that no line's end follows", () => {
    expect(notFound("Cannot find package 'left-pad' imported from /app/src/api.ts")).toEqual({
      specifier: "left-pad",
      importer: "/app/src/api.ts",
    });
    expect(
      notFound("Cannot find module '/app/x' imported from /app/in imported from/a.ts"),
    ).toEqual({ specifier: "/app/x", importer: "/app/in imported from/a.ts" });
    expect(notFound("Cannot find package 'x' imported from /a.js\r imported from /b.js")).toEqual({
      specifier: "x",
      importer: "/b.js",
    });
    expect(notFound("Cannot find package 'x' imported from /a.js\u2028")).toEqual({
      specifier: "x",
      importer: undefined,
    });
    expect(notFound("Cannot find package 'x' imported from ")).toEqual({
      specifier: "x",
      importer: undefined,
    });
    expect(notFound("Cannot find module 'x'\nRequire stack:\n- /app/a.js")).toEqual({
      specifier: "x",
      importer: undefined,
    });
  });

  it("is read in time linear in the line, however many times it says ' imported from '", () => {
    const line = `Cannot find package 'x' imported from ${" imported from a".repeat(20_000)}\r`;

    const { took, value } = timed(() => notFound(line));

    expect(value).toEqual({ specifier: "x", importer: undefined });
    expect(took).toBeLessThan(LINEAR_MS);
  });
});
