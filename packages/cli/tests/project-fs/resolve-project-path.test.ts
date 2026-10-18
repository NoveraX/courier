import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { isWithin } from "../../src/project-fs/is-within";
import { PathOutsideProjectError } from "../../src/project-fs/path-outside-project-error";
import { resolveProjectPath } from "../../src/project-fs/resolve-project-path";

function refusal(path: string, api = posix, root = "/proj"): unknown {
  try {
    resolveProjectPath(root, path, api);
  } catch (error) {
    return error;
  }
  return null;
}

describe("resolveProjectPath", () => {
  it("resolves a path inside the project", () => {
    expect(resolveProjectPath("/proj", "src/api/pets/index.ts", posix)).toBe(
      "/proj/src/api/pets/index.ts",
    );
    expect(resolveProjectPath("/proj", "src/./api/../api/x.ts", posix)).toBe("/proj/src/api/x.ts");
  });

  it("resolves inside a Windows project, where a string prefix check refused every path", () => {
    expect(resolveProjectPath("C:\\proj", "src/api/x.ts", win32)).toBe("C:\\proj\\src\\api\\x.ts");
    expect(resolveProjectPath("C:\\proj", "src\\api\\x.ts", win32)).toBe(
      "C:\\proj\\src\\api\\x.ts",
    );
  });

  it("refuses a path that climbs out", () => {
    const error = refusal("src/../../other/a.ts");

    expect(error).toBeInstanceOf(PathOutsideProjectError);
    expect(error).toMatchObject({ code: "PATH_OUTSIDE_PROJECT", httpStatus: 400 });
  });

  it("refuses absolute paths in either platform's form", () => {
    for (const path of [
      "/etc/passwd",
      "\\Windows\\a",
      "C:\\a.ts",
      "C:/a.ts",
      "\\\\server\\share\\a",
    ]) {
      expect(refusal(path)).toBeInstanceOf(PathOutsideProjectError);
      expect(refusal(path, win32, "C:\\proj")).toBeInstanceOf(PathOutsideProjectError);
    }
  });

  it("refuses a drive-relative path, a stream name and a NUL byte", () => {
    for (const path of ["C:foo.ts", "src/a.ts:stream", "src/a\0.ts", ""]) {
      expect(refusal(path, win32, "C:\\proj")).toBeInstanceOf(PathOutsideProjectError);
    }
  });

  it("keeps a name that starts with two dots inside, and the project itself", () => {
    expect(resolveProjectPath("/proj", "..foo/a.ts", posix)).toBe("/proj/..foo/a.ts");
    expect(resolveProjectPath("C:\\proj", "..foo\\a.ts", win32)).toBe("C:\\proj\\..foo\\a.ts");
    expect(resolveProjectPath("/proj", "src/..", posix)).toBe("/proj");
  });

  it("accepts exactly the paths isWithin calls inside, by either platform's rules", () => {
    const paths = [
      "a",
      "a/b",
      "./a",
      "a/..",
      "a/../..",
      "..",
      "../a",
      "..foo",
      "..foo/../..",
      ".../x",
      "a/./b/../../c",
      "a/../../proj/x",
      "a\\..\\..\\x",
      "src/..\\..",
      "src\\..\\a",
    ];
    for (const [api, root] of [
      [posix, "/proj"],
      [win32, "C:\\proj"],
    ] as const) {
      for (const path of paths) {
        const inside = isWithin(root, api.resolve(root, path), api);
        expect([path, refusal(path, api, root) === null]).toEqual([path, inside]);
      }
    }
  });

  it("names the path as it was given, not where it resolves", () => {
    expect(refusal("../secret.ts")).toMatchObject({ path: "../secret.ts" });
  });
});
