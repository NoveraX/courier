import { describe, expect, it } from "vitest";

import { globHead, globTest } from "../../../src/upgrade/entries/glob-match";

describe("a glob's pattern", () => {
  it("splits at the first segment its syntax starts in", () => {
    expect(globHead("./pages/*.tsx")).toEqual({ folder: "./pages", rest: "*.tsx" });
    expect(globHead("/src/**/index.ts")).toEqual({ folder: "/src", rest: "**/index.ts" });
    expect(globHead("@/widgets/{a,b}/*.vue")).toEqual({ folder: "@/widgets", rest: "{a,b}/*.vue" });
    expect(globHead("**/bar.js")).toEqual({ folder: "", rest: "**/bar.js" });
    expect(globHead("./pages/home.tsx")).toEqual({ folder: "./pages", rest: "home.tsx" });
  });

  it("matches a path under its folder as Vite's glob does, dot folders too", () => {
    const test = (rest: string, path: string, anyCase = false) => globTest(rest, anyCase)?.(path);

    expect(test("*.tsx", "Home.tsx")).toBe(true);
    expect(test("*.tsx", "admin/Users.tsx")).toBe(false);
    expect(test("**/*.tsx", "Home.tsx")).toBe(true);
    expect(test("**/*.tsx", "admin/deep/Users.tsx")).toBe(true);
    expect(test("*/index.ts", "users/index.ts")).toBe(true);
    expect(test("**/index.ts", "users/list.ts")).toBe(false);
    expect(test("page?.ts", "page1.ts")).toBe(true);
    expect(test("page?.ts", "page10.ts")).toBe(false);
    expect(test("[a-c]*.ts", "beta.ts")).toBe(true);
    expect(test("[!a-c]*.ts", "beta.ts")).toBe(false);
    expect(test("*.{ts,tsx}", "a.tsx")).toBe(true);
    expect(test("{admin/{users,roles},shop}/*.ts", "admin/roles/list.ts")).toBe(true);
    expect(test("{admin/{users,roles},shop}/*.ts", "admin/logs/list.ts")).toBe(false);
    expect(test("*.TSX", "Home.tsx", true)).toBe(true);
    expect(test("*.TSX", "Home.tsx")).toBe(false);
    expect(test("**/*.ts", ".cache/.hidden/a.ts")).toBe(true);
  });

  it("matches a long run of stars in time, without trying each way it may split", () => {
    const started = performance.now();

    expect(test40()).toBe(false);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("reads no syntax it does not know, which then names every file under its folder", () => {
    expect(globTest("+(a|b).ts", false)).toBeUndefined();
    expect(globTest("page{1..9}.ts", false)).toBeUndefined();
    expect(globTest("[[:alpha:]].ts", false)).toBeUndefined();
    expect(globTest(`${"{a,b}".repeat(7)}.ts`, false)).toBeUndefined();
  });
});

/* A pattern of forty stars against a name they all fit but its end: a matcher that tries each split takes years. */
function test40(): boolean | undefined {
  return globTest(`${"*a".repeat(40)}b`, false)?.("a".repeat(200));
}
