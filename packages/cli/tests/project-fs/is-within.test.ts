import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { isWithin } from "../../src/project-fs/is-within";

describe("isWithin", () => {
  it("accepts the directory itself and paths inside it", () => {
    expect(isWithin("/proj", "/proj", posix)).toBe(true);
    expect(isWithin("/proj", "/proj/src/a.ts", posix)).toBe(true);
    expect(isWithin("/proj", "/proj/..foo/a.ts", posix)).toBe(true);
  });

  it("refuses a sibling that shares the directory's name as a prefix", () => {
    expect(isWithin("/proj", "/proj-other/a.ts", posix)).toBe(false);
    expect(isWithin("/proj", "/pro", posix)).toBe(false);
  });

  it("refuses the parent and paths beside the directory", () => {
    expect(isWithin("/proj", "/", posix)).toBe(false);
    expect(isWithin("/proj/src", "/proj/lib/a.ts", posix)).toBe(false);
  });

  it("compares Windows paths across separators and letter case", () => {
    expect(isWithin("C:\\proj", "C:\\proj\\src\\a.ts", win32)).toBe(true);
    expect(isWithin("C:\\proj", "c:\\PROJ\\src", win32)).toBe(true);
    expect(isWithin("C:\\proj", "C:/proj/src/a.ts", win32)).toBe(true);
  });

  it("refuses another drive, a network share and a Windows sibling prefix", () => {
    expect(isWithin("C:\\proj", "D:\\proj\\a.ts", win32)).toBe(false);
    expect(isWithin("C:\\proj", "\\\\server\\share\\a.ts", win32)).toBe(false);
    expect(isWithin("C:\\proj", "C:\\proj-other\\a.ts", win32)).toBe(false);
    expect(isWithin("C:\\proj", "C:\\a.ts", win32)).toBe(false);
  });
});
