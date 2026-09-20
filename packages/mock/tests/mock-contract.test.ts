import { courier, defineGroup } from "@noverax/courier/define";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it } from "vitest";
import { getEndpointSchema, validateEndpoint, validateSource } from "../src/contract/validator";
import { createContractReport } from "../src/contract/report";

// Minimal Standard Schema implementation for testing
type SchemaResult<T> = { value: T } | { issues: Array<{ message: string; path?: Array<{ key: string }> }> };

function createSchema<T>(
  validate: (value: unknown) => SchemaResult<T>,
): StandardSchemaV1<unknown, T> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate,
    },
  } as unknown as StandardSchemaV1<unknown, T>;
}

const userSchema = createSchema<{ id: string; name: string; email: string }>((value) => {
  const obj = value as Record<string, unknown>;
  const issues: Array<{ message: string; path: Array<{ key: string }> }> = [];

  if (typeof obj?.id !== "string") issues.push({ message: "Expected string", path: [{ key: "id" }] });
  if (typeof obj?.name !== "string") issues.push({ message: "Expected string", path: [{ key: "name" }] });
  if (typeof obj?.email !== "string") issues.push({ message: "Expected string", path: [{ key: "email" }] });

  return issues.length ? { issues } : { value: value as { id: string; name: string; email: string } };
});

const { query } = courier();

describe("getEndpointSchema", () => {
  it("reads the schema an endpoint carries", () => {
    const fn = query.response(userSchema).via((http) => http.get(""));

    const schema = getEndpointSchema(fn);
    expect(schema).toBeDefined();
    expect(schema?.response).toBe(userSchema);
  });

  it("returns undefined for a plain function", () => {
    expect(getEndpointSchema(() => {})).toBeUndefined();
  });

  it("returns undefined for non-functions", () => {
    expect(getEndpointSchema("not a function")).toBeUndefined();
    expect(getEndpointSchema(null)).toBeUndefined();
  });
});

describe("validateEndpoint", () => {
  it("passes for valid data", async () => {
    const result = await validateEndpoint(
      userSchema,
      { id: "1", name: "Alice", email: "alice@test.com" },
      "response",
    );
    expect(result.status).toBe("pass");
  });

  it("fails for invalid data", async () => {
    const result = await validateEndpoint(
      userSchema,
      { id: "1", name: "Alice" }, // missing email
      "response",
    );
    expect(result.status).toBe("fail");
    expect(result.issues).toHaveLength(1);
    expect(result.issues?.[0]?.path).toBe("email");
  });

  it("skips when no schema provided", async () => {
    const result = await validateEndpoint(undefined, { anything: true }, "response");
    expect(result.status).toBe("skip");
  });
});

describe("validateSource", () => {
  it("validates every endpoint a source defines", async () => {
    const users = defineGroup({
      prefix: "users",
      endpoints: {
        getAll: query.response(userSchema).via((http) => http.get("")),
        // No response schema — must be skipped, not silently passed
        create: query.via((http) => http.post("")),
      },
    });

    const source = { users };

    const mockData = new Map<string, unknown>();
    mockData.set("users/getAll", { id: "1", name: "Alice", email: "a@t.com" });

    const results = await validateSource(
      source as Record<string, Record<string, unknown>>,
      mockData,
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe("pass"); // getAll with schema
    expect(results[1]?.status).toBe("skip"); // create without schema
  });
});

describe("ContractReport", () => {
  const results = [
    { group: "users", method: "getAll", status: "pass" as const },
    {
      group: "users",
      method: "getById",
      status: "fail" as const,
      target: "response" as const,
      issues: [{ path: "email", message: "Expected string" }],
    },
    { group: "posts", method: "getAll", status: "skip" as const },
  ];

  it("computes passed/failed/skipped counts", () => {
    const report = createContractReport(results);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.skipped).toBe(1);
  });

  it("formats as Markdown", () => {
    const report = createContractReport(results);
    const md = report.toMarkdown();

    expect(md).toContain("# Contract Validation Report");
    expect(md).toContain("✅ `users.getAll`");
    expect(md).toContain("❌ `users.getById`");
    expect(md).toContain("⏭️ `posts.getAll`");
    expect(md).toContain("`email`: Expected string");
  });

  it("formats as JUnit XML", () => {
    const report = createContractReport(results);
    const xml = report.toJUnit();

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('tests="3"');
    expect(xml).toContain('failures="1"');
    expect(xml).toContain('skipped="1"');
    expect(xml).toContain("<failure");
    expect(xml).toContain("<skipped");
  });

  it("formats as TAP", () => {
    const report = createContractReport(results);
    const tap = report.toTAP();

    expect(tap).toContain("TAP version 13");
    expect(tap).toContain("1..3");
    expect(tap).toContain("ok 1 - users.getAll");
    expect(tap).toContain("not ok 2 - users.getById");
    expect(tap).toContain("ok 3 - posts.getAll # SKIP");
  });

  it("formats as JSON", () => {
    const report = createContractReport(results);
    const json = JSON.parse(report.toJSON());

    expect(json.passed).toBe(1);
    expect(json.failed).toBe(1);
    expect(json.results).toHaveLength(3);
  });
});

describe("validateSource reports every endpoint", () => {
  it("skips rather than omits an endpoint it cannot check", async () => {
    const users = defineGroup({
      prefix: "users",
      endpoints: {
        withSchema: query.response(userSchema).via((http) => http.get("")),
        noSchema: query.via((http) => http.get("bare")),
      },
    });

    const results = await validateSource({ users }, new Map());

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "skip")).toBe(true);
    expect(results.map((r) => r.method)).toEqual(["withSchema", "noSchema"]);
  });

  it("ignores a helper sitting in the group beside the endpoints", async () => {
    const source = {
      users: {
        options: {},
        getAll: query.response(userSchema).via((http) => http.get("")),
        helper: () => "not an endpoint",
      },
    };

    const results = await validateSource(
      source as unknown as Record<string, Record<string, unknown>>,
      new Map([["users/getAll", { id: "1", name: "Alice", email: "a@t.com" }]]),
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.method).toBe("getAll");
    expect(results[0]?.status).toBe("pass");
  });
});
