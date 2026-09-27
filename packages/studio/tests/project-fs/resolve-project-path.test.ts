import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { PathOutsideProjectError } from "../../src/server/project-fs/path-outside-project-error";
import { resolveProjectPath } from "../../src/server/project-fs/resolve-project-path";

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
    expect(resolveProjectPath("C:\\proj", "src\\api\\x.ts", win32)).toBe("C:\\proj\\src\\api\\x.ts");
  });

  it("refuses a path that climbs out", () => {
    const error = refusal("src/../../other/a.ts");

    expect(error).toBeInstanceOf(PathOutsideProjectError);
    expect(error).toMatchObject({ code: "PATH_OUTSIDE_PROJECT", httpStatus: 400 });
  });

  it("refuses absolute paths in either platform's form", () => {
    for (const path of ["/etc/passwd", "\\Windows\\a", "C:\\a.ts", "C:/a.ts", "\\\\server\\share\\a"]) {
      expect(refusal(path)).toBeInstanceOf(PathOutsideProjectError);
      expect(refusal(path, win32, "C:\\proj")).toBeInstanceOf(PathOutsideProjectError);
    }
  });

  it("refuses a drive-relative path, a stream name and a NUL byte", () => {
    for (const path of ["C:foo.ts", "src/a.ts:stream", "src/a\0.ts", ""]) {
      expect(refusal(path, win32, "C:\\proj")).toBeInstanceOf(PathOutsideProjectError);
    }
  });

  it("names the path as it was given, not where it resolves", () => {
    expect(refusal("../secret.ts")).toMatchObject({ path: "../secret.ts" });
  });
});
