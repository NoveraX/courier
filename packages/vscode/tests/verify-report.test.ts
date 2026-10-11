/**
 * The report `courier-studio verify --format json` prints, as the Test
 * Explorer reads it: each file's checked calls with what broke each, the
 * files passed over and why, anything else no report at all; and a
 * problem said as a test's failure, each place the schema refused below.
 */
import { describe, expect, it } from "vitest";

import { problemText, verifyReportOf } from "../src/testing/verify-report";

const REPORT = {
  totals: { calls: 2, broken: 1, unchecked: 0 },
  files: [
    {
      file: "tests/recorded/checkout.har",
      checks: [
        {
          at: 1,
          source: "shop",
          endpoint: "orders.place",
          label: "shop orders.place · POST /orders → 201",
          status: 201,
          problems: [],
          unchecked: [],
        },
        {
          at: 2,
          endpoint: "products.get",
          label: "shop products.get · GET /products/p_1 → 200",
          status: 200,
          problems: [
            {
              kind: "answer-refused",
              message: "The answer no longer fits the response schema",
              issues: [{ path: "price", message: "Expected number, received string" }],
            },
          ],
          unchecked: [],
        },
      ],
    },
  ],
  skipped: [{ file: "tests/recorded/browser.har", reason: "not a recording" }],
};

describe("verify's report, as the Test Explorer reads it", () => {
  it("reads each file's calls, what broke each, and the files passed over", () => {
    const report = verifyReportOf(JSON.stringify(REPORT));

    expect(report?.files[0]?.checks.map((check) => [check.at, check.problems.length])).toEqual([
      [1, 0],
      [2, 1],
    ]);
    expect(report?.skipped).toEqual([
      { file: "tests/recorded/browser.har", reason: "not a recording" },
    ]);
  });

  it("reads anything else as no report", () => {
    expect(verifyReportOf("courier-studio verify needs @noverax/courier-mock")).toBeUndefined();
    expect(verifyReportOf(JSON.stringify({ files: "none" }))).toBeUndefined();
  });

  it("says a problem as a failure: what changed, then each place the schema refused", () => {
    const [, broken] = verifyReportOf(JSON.stringify(REPORT))?.files[0]?.checks ?? [];

    expect(problemText(broken?.problems[0] ?? { kind: "", message: "" })).toBe(
      "The answer no longer fits the response schema\n  price: Expected number, received string",
    );
  });
});
