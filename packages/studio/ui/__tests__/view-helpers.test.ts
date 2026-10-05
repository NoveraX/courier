/**
 * Helpers behind the Compare, Analytics, Playground and APIs views: the line
 * diff, the latency histogram, the comment toggle of the variables editor,
 * the theme cycle and the name an imported API is given.
 */
import { describe, expect, it } from "vitest";

import { nextTheme } from "@/app-config";
import { toggleComment } from "@/features/playground/jsonc-helpers";
import type { RequestEntry } from "@/store/types";
import { computeHistogram } from "../src/views/analytics/compute-histogram";
import { deriveSourceName } from "../src/views/apis/derive-source-name";
import type { ParsedSpec } from "../src/views/apis/types";
import { computeTextDiff } from "../src/views/compare/text-diff";

describe("computeTextDiff", () => {
  it("keeps the common lines and marks what each side has alone", () => {
    expect(
      computeTextDiff("a\nb\nc", "a\nx\nc").map((line) => [line.type, line.left ?? line.right]),
    ).toEqual([
      ["equal", "a"],
      ["removed", "b"],
      ["added", "x"],
      ["equal", "c"],
    ]);
  });

  it("numbers the lines of each side", () => {
    expect(computeTextDiff("a", "b\na").map((line) => line.lineNum)).toEqual([
      { right: 1 },
      { left: 1, right: 2 },
    ]);
  });

  it("marks every line of an empty side's counterpart", () => {
    expect(computeTextDiff("", "a\nb").map((line) => line.type)).toEqual(["added", "added"]);
  });
});

describe("computeHistogram", () => {
  const request = (status: RequestEntry["status"], total?: number): RequestEntry => ({
    id: `r${total ?? "none"}-${status}`,
    source: "api",
    group: undefined,
    method: "list",
    variables: undefined,
    mode: "direct",
    status,
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: 0,
    sessionId: "server",
    ...(total === undefined
      ? {}
      : { timing: { total, middleware: 0, fetch: total, validation: 0 } }),
  });

  it("counts each finished request in the bucket of its duration, split by outcome", () => {
    const buckets = computeHistogram([
      request("success", 10),
      request("error", 20),
      request("success", 150),
      request("validation_error", 5000),
      request("pending", 10),
      request("success"),
    ]);

    expect(buckets.map((b) => [b.label, b.success, b.error])).toEqual([
      ["<50ms", 1, 1],
      ["50–100", 0, 0],
      ["100–200", 1, 0],
      ["200–500", 0, 0],
      ["500ms–1s", 0, 0],
      [">1s", 0, 1],
    ]);
  });
});

describe("toggleComment", () => {
  it("comments every selected line, keeping each one's indent", () => {
    expect(toggleComment('{\n  "a": 1,\n  "b": 2\n}', 2, 20)).toEqual({
      text: '{\n  // "a": 1,\n  // "b": 2\n}',
      start: 5,
      end: 23,
    });
  });

  it("uncomments the selection when every line of it is commented", () => {
    expect(toggleComment("// a\n//b", 0, 7).text).toBe("a\nb");
  });
});

describe("nextTheme", () => {
  it("cycles dark, light, system", () => {
    expect([nextTheme("dark"), nextTheme("light"), nextTheme("system")]).toEqual([
      "light",
      "system",
      "dark",
    ]);
  });
});

describe("deriveSourceName", () => {
  const spec = (title: string, baseURL = ""): ParsedSpec => ({
    title,
    version: "1",
    description: "",
    baseURL,
    format: "openapi3",
    groups: [],
    schemas: {},
    securitySchemes: [],
    skipped: [],
  });

  it("names an API from its title", () => {
    expect(deriveSourceName(spec("Pet Store"))).toBe("petStore");
  });

  it("falls back to the most telling part of its host, past the TLD and generic sub-domains", () => {
    expect(deriveSourceName(spec("API", "https://api.stripe.com/v1"))).toBe("stripe");
  });
});
