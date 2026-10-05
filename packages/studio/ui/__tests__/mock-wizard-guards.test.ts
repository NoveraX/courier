/**
 * The mock wizard reads Studio's answers only through its guards: every
 * outcome Studio sends is accepted as sent, and anything else — a missing
 * or mistyped field, an unknown status or refusal code, a body that is not
 * a plain object — is refused as a whole. The wire types must be exactly
 * the server's; the type assertion below fails the UI typecheck otherwise.
 */
import { describe, expect, it } from "vitest";

import type * as Server from "../../src/server/mocks-edit/types";
import { isDeclareApplyResult } from "../src/features/mocks/wizard/is-declare-apply-result";
import { isDeclarePreview } from "../src/features/mocks/wizard/is-declare-preview";
import type * as Wizard from "../src/features/mocks/wizard/wire-types";

type Same<TLeft, TRight> = [TLeft] extends [TRight]
  ? [TRight] extends [TLeft]
    ? true
    : false
  : false;

const WIRE_MATCHES_SERVER: [
  Same<Server.MockDeclaration, Wizard.MockDeclaration>,
  Same<Server.DeclarePreview, Wizard.DeclarePreview>,
  Same<Server.DeclareApplyResult, Wizard.DeclareApplyResult>,
  Same<Server.RefusalCode, Wizard.RefusalCode>,
] = [true, true, true, true];

const HASH = "a".repeat(64);
const DIGEST = "b".repeat(64);

const CREATE = {
  status: "ready",
  target: "courier.mocks.ts",
  creates: true,
  baseHash: null,
  planDigest: DIGEST,
  hunks: [
    { lines: [{ kind: "add", text: "export default defineMocks({", oldLine: null, newLine: 1 }] },
  ],
  warnings: ["Studio creates courier.mocks.ts."],
};
const EDIT = {
  ...CREATE,
  creates: false,
  baseHash: HASH,
  hunks: [
    {
      lines: [
        { kind: "context", text: "export default defineMocks({", oldLine: 4, newLine: 4 },
        {
          kind: "remove",
          text: "  first: defineMockServer({ source })",
          oldLine: 5,
          newLine: null,
        },
        { kind: "add", text: "  first: defineMockServer({ source }),", oldLine: null, newLine: 5 },
        { kind: "add", text: "  second: defineMockServer({ source }),", oldLine: null, newLine: 6 },
      ],
    },
  ],
  warnings: [],
};
const MANUAL = {
  status: "manual",
  target: null,
  creates: true,
  reasons: [
    {
      code: "NOT_LOCAL_PEER",
      source: null,
      message: "Studio edits project files only for a browser on this machine.",
    },
  ],
  snippet: 'import { defineMocks } from "@noverax/courier-mock";\n',
  retryable: false,
};
const INVALID = {
  status: "invalid",
  errors: [
    { index: 0, source: "api", field: "key", message: "courier.mocks.ts already declares api" },
  ],
};
const INSERTED = [{ line: 5, text: "  first: defineMockServer({ source }),", added: "," }];

describe("the preview guard", () => {
  it("mirrors the server's contract exactly", () => {
    expect(WIRE_MATCHES_SERVER).toEqual([true, true, true, true]);
  });

  it("accepts every outcome of a preview as Studio sends it", () => {
    for (const outcome of [CREATE, EDIT, MANUAL, INVALID])
      expect(isDeclarePreview(outcome)).toBe(true);
    expect(isDeclarePreview({ ...MANUAL, target: "courier.mocks.ts", retryable: true })).toBe(true);
  });

  it("refuses a plan the wizard could not show or apply as it is", () => {
    expect(isDeclarePreview({ ...EDIT, hunks: [] })).toBe(false);
    expect(isDeclarePreview({ ...CREATE, baseHash: HASH })).toBe(false);
    expect(isDeclarePreview({ ...EDIT, baseHash: null })).toBe(false);
    expect(isDeclarePreview({ ...EDIT, planDigest: "B".repeat(64) })).toBe(false);
    expect(isDeclarePreview({ ...EDIT, warnings: [1] })).toBe(false);
    const numberedOnBothSides = { kind: "add", text: "x", oldLine: 1, newLine: 2 };
    expect(isDeclarePreview({ ...EDIT, hunks: [{ lines: [numberedOnBothSides] }] })).toBe(false);
  });

  it("refuses a manual outcome without a reason it knows, or without a snippet", () => {
    expect(isDeclarePreview({ ...MANUAL, reasons: [] })).toBe(false);
    expect(isDeclarePreview({ ...MANUAL, snippet: "" })).toBe(false);
    const unknown = { code: "SOMETHING_NEW", source: null, message: "?" };
    expect(isDeclarePreview({ ...MANUAL, reasons: [unknown] })).toBe(false);
    expect(isDeclarePreview({ ...MANUAL, retryable: "yes" })).toBe(false);
  });

  it("refuses field errors that do not name a position and a field", () => {
    expect(isDeclarePreview({ status: "invalid", errors: [] })).toBe(false);
    expect(
      isDeclarePreview({ status: "invalid", errors: [{ ...INVALID.errors[0], index: -1 }] }),
    ).toBe(false);
    expect(
      isDeclarePreview({ status: "invalid", errors: [{ ...INVALID.errors[0], field: "mocks" }] }),
    ).toBe(false);
    expect(
      isDeclarePreview({ status: "invalid", errors: [{ ...INVALID.errors[0], source: null }] }),
    ).toBe(false);
  });

  it("refuses an unknown status and a body that is not a plain object", () => {
    expect(isDeclarePreview({ ...CREATE, status: "applied" })).toBe(false);
    expect(isDeclarePreview([CREATE])).toBe(false);
    expect(isDeclarePreview(null)).toBe(false);
    expect(
      isDeclarePreview(JSON.parse(`{"__proto__": {"x": 1}, ${JSON.stringify(CREATE).slice(1)}`)),
    ).toBe(false);
  });
});

describe("the apply guard", () => {
  it("accepts every outcome of an apply as Studio sends it", () => {
    const outcomes = [
      { status: "applied", target: "courier.mocks.ts", keys: ["apiMock"], warnings: [] },
      { status: "stale", plan: EDIT },
      { status: "stale", plan: MANUAL },
      { status: "stale", plan: INVALID },
      INVALID,
      {
        ...MANUAL,
        target: "courier.mocks.ts",
        reasons: [{ code: "STUDIO_BUSY", source: null, message: "busy" }],
      },
      {
        status: "rolledBack",
        target: "courier.mocks.ts",
        creates: false,
        reason: "did not load",
        snippet: "x",
      },
      {
        status: "notVerified",
        target: "courier.mocks.ts",
        reason: "did not load",
        insertedLines: INSERTED,
      },
      {
        status: "rollbackFailed",
        target: "courier.mocks.ts",
        reason: "EACCES",
        insertedLines: INSERTED,
      },
    ];
    for (const outcome of outcomes) expect(isDeclareApplyResult(outcome)).toBe(true);
  });

  it("refuses an outcome missing what the wizard shows of it", () => {
    expect(
      isDeclareApplyResult({
        status: "applied",
        target: "courier.mocks.ts",
        keys: [],
        warnings: [],
      }),
    ).toBe(false);
    expect(isDeclareApplyResult({ status: "stale", plan: { status: "applied" } })).toBe(false);
    expect(
      isDeclareApplyResult({
        status: "rolledBack",
        target: "courier.mocks.ts",
        creates: false,
        reason: "x",
        snippet: "",
      }),
    ).toBe(false);
    expect(
      isDeclareApplyResult({
        status: "notVerified",
        target: "courier.mocks.ts",
        reason: "x",
        insertedLines: [],
      }),
    ).toBe(false);
    const unnumbered = [{ line: 0, text: "x", added: "x" }];
    expect(
      isDeclareApplyResult({
        status: "rollbackFailed",
        target: "courier.mocks.ts",
        reason: "x",
        insertedLines: unnumbered,
      }),
    ).toBe(false);
    expect(isDeclareApplyResult(CREATE)).toBe(false);
  });
});
