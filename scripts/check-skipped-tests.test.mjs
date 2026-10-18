/**
 * Self-test for `scripts/check-skipped-tests.mjs`: the tests a Vitest JSON
 * report skipped, named from the repository's root as each platform writes
 * its paths, and held to the list a platform expects — a test skipped that
 * the list does not name, and one the list names that ran, both told.
 */

import { win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { compareSkipped, skippedTests } from "./check-skipped-tests.mjs";

const REPORT = {
  testResults: [
    {
      name: "/repo/packages/studio/tests/describe-error.test.ts",
      assertionResults: [
        { status: "passed", title: "folds a message", ancestorTitles: ["describeError"] },
        {
          status: "skipped",
          title: "takes the root off a Windows path",
          ancestorTitles: ["describeError"],
        },
      ],
    },
    {
      name: "/repo/packages/redis/tests/redis-integration.test.ts",
      assertionResults: [
        {
          status: "pending",
          title: "publishes",
          ancestorTitles: ["createRedisPubSub", "with a server"],
        },
        { status: "todo", title: "presence expires" },
        { status: "failed", title: "subscribes", ancestorTitles: ["createRedisPubSub"] },
      ],
    },
  ],
};

describe("skippedTests", () => {
  it("names each test skipped, pending or left to do, by file and describe blocks, sorted", () => {
    expect(skippedTests(REPORT, "/repo")).toEqual([
      "packages/redis/tests/redis-integration.test.ts > createRedisPubSub > with a server > publishes",
      "packages/redis/tests/redis-integration.test.ts > presence expires",
      "packages/studio/tests/describe-error.test.ts > describeError > takes the root off a Windows path",
    ]);
  });

  it("names a Windows path with forward slashes, as the list writes it on every platform", () => {
    const report = {
      testResults: [
        {
          name: "C:\\repo\\packages\\cli\\tests\\a.test.ts",
          assertionResults: [{ status: "skipped", title: "b", ancestorTitles: ["c"] }],
        },
      ],
    };

    expect(skippedTests(report, "C:\\repo", win32)).toEqual([
      "packages/cli/tests/a.test.ts > c > b",
    ]);
  });

  it("names none for a report without results", () => {
    expect(skippedTests({}, "/repo")).toEqual([]);
  });
});

describe("compareSkipped", () => {
  it("finds nothing apart when the run skipped the tests listed", () => {
    expect(compareSkipped(["a > x", "b > y"], ["b > y", "a > x"])).toEqual({
      unexpected: [],
      ran: [],
    });
  });

  it("tells a test skipped that the list does not name", () => {
    expect(compareSkipped(["a > x", "c > z"], ["a > x"])).toEqual({
      unexpected: ["c > z"],
      ran: [],
    });
  });

  it("tells a test the list names that ran", () => {
    expect(compareSkipped(["a > x"], ["a > x", "b > y"])).toEqual({
      unexpected: [],
      ran: ["b > y"],
    });
  });

  it("counts two tests that share a name apart", () => {
    expect(compareSkipped(["a > x", "a > x"], ["a > x"])).toEqual({
      unexpected: ["a > x"],
      ran: [],
    });
    expect(compareSkipped(["a > x"], ["a > x", "a > x"])).toEqual({
      unexpected: [],
      ran: ["a > x"],
    });
  });
});
