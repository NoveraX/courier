/**
 * What the inspector tells of how a request went: the checks Courier ran —
 * its schemas, its middleware, its cache, or a stream's handshake and
 * connection — and, for one that failed, where it failed, the schema
 * issues, advice when its kind says enough, and the error as reported.
 */
import { describe, expect, it } from "vitest";

import { failureHint } from "@/features/requests/failure-hints";
import { requestChecks } from "@/features/requests/request-checks";
import { failureOf } from "@/features/requests/request-failure";
import { requestEntry } from "./request-entry-fixture";

const validated = { variables: true, response: true };

describe("the checks", () => {
  it("say each schema matched, and the middleware in the order it ran", () => {
    const r = requestEntry({
      variables: { page: 2, limit: 20 },
      hasValidation: validated,
      validated: { variables: "passed", response: "passed" },
      middlewareEntries: [
        { requestId: "r1", name: "logger", index: 1, startedAt: 0, status: "completed" },
        { requestId: "r1", name: "auth", index: 0, startedAt: 0, status: "completed" },
      ],
    });

    expect(requestChecks(r)).toEqual([
      {
        label: "Variables validated",
        detail: "Matched the input schema",
        meta: "2 fields",
        state: "ok",
      },
      { label: "Response validated", detail: "Matched the response schema", meta: "", state: "ok" },
      { label: "Middleware", detail: "auth → logger", meta: "2 steps", state: "ok" },
    ]);
  });

  it("say what was not checked, and why, without claiming it passed", () => {
    const failed = requestEntry({
      status: "error",
      hasValidation: validated,
      validated: { variables: "passed" },
    });
    const pending = requestEntry({
      status: "pending",
      hasValidation: validated,
      validated: { variables: "passed" },
    });

    expect(requestChecks(requestEntry()).map((c) => [c.label, c.detail, c.state])).toEqual([
      ["No input validation", "The endpoint declares no input schema", "idle"],
      ["No response validation", "The endpoint declares no response schema", "idle"],
      ["Middleware", "No middleware ran", "idle"],
    ]);
    expect(requestChecks(failed)[1]).toMatchObject({
      label: "Response not validated",
      detail: "Skipped · no response to check",
    });
    expect(requestChecks(pending)[1]).toMatchObject({
      label: "Response not validated yet",
      detail: "Waiting for the response",
    });
  });

  it("say the variables were rejected when the input schema refused them", () => {
    const r = requestEntry({
      status: "validation_error",
      variables: { page: -1 },
      hasValidation: validated,
      validated: { variables: "failed" },
    });

    expect(requestChecks(r)[0]).toEqual({
      label: "Variables rejected",
      detail: "Refused by the input schema; nothing was sent",
      meta: "1 field",
      state: "err",
    });
  });

  it("name the issues a broken response has, and the cache when it took part", () => {
    const r = requestEntry({
      status: "validation_error",
      hasValidation: validated,
      validated: { variables: "passed", response: "failed" },
      error: {
        type: "validation",
        message: "x",
        validationIssues: [{ path: "hits.1.price", message: "Expected number" }],
      },
      cache: { hit: true, age: 12_000 },
    });

    const checks = requestChecks(r);

    expect(checks[1]).toEqual({
      label: "Response schema mismatch",
      detail: "1 issue · hits.1.price",
      meta: "1 issue",
      state: "warn",
    });
    expect(checks[3]).toEqual({
      label: "Cache",
      detail: "Served from the cache, stored 12.00s before",
      meta: "hit",
      state: "ok",
    });
  });

  it("follow a stream's handshake and connection", () => {
    const socket = requestEntry({
      transport: "ws",
      streamStatus: "error",
      error: { type: "error", message: "closed 1006" },
    });

    expect(requestChecks(socket).map((c) => [c.label, c.state])).toEqual([
      ["Handshake", "ok"],
      ["Connection", "err"],
      ["Middleware", "idle"],
    ]);
    expect(requestChecks(socket)[1]?.detail).toBe("closed 1006");
  });
});

describe("a failure", () => {
  it("is none for a request that did not fail", () => {
    expect(failureOf(requestEntry())).toBeNull();
    expect(failureOf(requestEntry({ status: "aborted" }))).toBeNull();
  });

  it("of the fetch names the status, where, and what usually fixes it", () => {
    const r = requestEntry({
      status: "error",
      statusCode: 503,
      timing: { total: 3200, middleware: 0, fetch: 3200, validation: 0 },
      error: { type: "http", status: 503, message: "Service Unavailable" },
      middlewareEntries: [
        { requestId: "r1", name: "auth", index: 0, startedAt: 0, status: "completed" },
      ],
    });

    const failure = failureOf(r);

    expect(failure).toMatchObject({
      severity: "err",
      type: "HTTP",
      code: "503",
      message: "Service Unavailable",
      where: "Failed at the fetch after 3.20s",
    });
    expect(failure?.stages).toEqual([
      { label: "Middleware", state: "ok", meta: "1 passed" },
      { label: "Fetch", state: "err", meta: "503" },
      { label: "Validation", state: "skip", meta: "skipped" },
    ]);
    expect(failure?.hint).toMatch(/^The API failed while answering/);
    expect(JSON.parse(failure?.raw ?? "{}")).toMatchObject({
      type: "http",
      status: 503,
      requestId: "r1",
    });
  });

  it("of the response schema reads as a warning, with its issues", () => {
    const issues = [{ path: "hits.1.price", message: "Expected number, received string" }];
    const r = requestEntry({
      status: "validation_error",
      validated: { variables: "passed", response: "failed" },
      error: {
        type: "validation",
        message: "Validation failed: 1 issue(s)",
        validationIssues: issues,
      },
    });

    const failure = failureOf(r);

    expect(failure).toMatchObject({ severity: "warn", code: "schema", issues });
    expect(failure?.where).toBe(
      "The answer arrived in 120ms but broke users.list's response schema",
    );
    expect(failure?.stages.map((s) => s.state)).toEqual(["skip", "ok", "err"]);
  });

  it("of the variables says nothing was sent", () => {
    const r = requestEntry({
      status: "validation_error",
      statusCode: undefined,
      validated: { variables: "failed" },
      error: { type: "validation", message: "Validation failed: 1 issue(s)" },
    });

    expect(failureOf(r)?.where).toBe(
      "Refused before it was sent: the variables broke the input schema",
    );
    expect(failureOf(r)?.stages[1]).toEqual({ label: "Fetch", state: "skip", meta: "not sent" });
    expect(failureHint(r)).toMatch(/never sent/);
  });

  it("is advised on by its kind and status, and not when they say too little", () => {
    const hint = (fields: Parameters<typeof requestEntry>[0]) => failureHint(requestEntry(fields));

    expect(hint({ error: { type: "network", message: "x" }, statusCode: undefined })).toMatch(
      /could not reach the API/,
    );
    expect(hint({ error: { type: "timeout", message: "x" }, statusCode: undefined })).toMatch(
      /ran out of time/,
    );
    expect(hint({ error: { type: "http", message: "x" }, statusCode: 401 })).toMatch(/credentials/);
    expect(hint({ error: { type: "http", message: "x" }, statusCode: 404 })).toMatch(
      /Nothing was found/,
    );
    expect(hint({ error: { type: "http", message: "x" }, statusCode: 429 })).toMatch(/Retry-After/);
    expect(hint({ error: { type: "http", message: "x" }, statusCode: 418 })).toBeUndefined();
    expect(
      hint({ error: { type: "unknown", message: "x" }, statusCode: undefined }),
    ).toBeUndefined();
  });
});
