import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it } from "vitest";
import { createContractReport } from "../src/contract/report";
import { getEndpointSchema, validateEndpoint, validateSource } from "../src/contract/validator";

// Minimal Standard Schema implementation for testing
type SchemaResult<T> =
  | { value: T }
  | { issues: Array<{ message: string; path?: Array<{ key: string }> }> };

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

  if (typeof obj?.id !== "string")
    issues.push({ message: "Expected string", path: [{ key: "id" }] });
  if (typeof obj?.name !== "string")
    issues.push({ message: "Expected string", path: [{ key: "name" }] });
  if (typeof obj?.email !== "string")
    issues.push({ message: "Expected string", path: [{ key: "email" }] });

  return issues.length
    ? { issues }
    : { value: value as { id: string; name: string; email: string } };
});

const { endpoint } = courier();

describe("getEndpointSchema", () => {
  it("reads the schema an endpoint carries", () => {
    const fn = endpoint.get("").response(userSchema);

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
        getAll: endpoint.get("").response(userSchema),
        // No response schema — must be skipped, not silently passed
        create: endpoint.post(""),
      },
    });

    const source = defineApi({ baseURL: "https://api.test", groups: { users } });

    const mockData = new Map<string, unknown>();
    mockData.set("users/getAll", { id: "1", name: "Alice", email: "a@t.com" });

    const results = await validateSource(source, mockData);

    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe("pass"); // getAll with schema
    expect(results[1]?.status).toBe("skip"); // create without schema
  });

  it("reports mock data that breaks the schema of a defineApi source", async () => {
    const users = defineGroup({
      prefix: "users",
      endpoints: { getAll: endpoint.get("").response(userSchema) },
    });
    const api = defineApi({ baseURL: "https://api.test", groups: { users } });

    const results = await validateSource(api, new Map([["users/getAll", { id: 1 }]]));

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ group: "users", method: "getAll", status: "fail" });
  });

  it("validates the endpoints of a flat source, keyed by their name", async () => {
    const flat = defineApi({
      baseURL: "https://api.test",
      endpoints: { listUsers: endpoint.get("users").response(userSchema) },
    });

    const results = await validateSource(
      flat,
      new Map([["listUsers", { id: "1", name: "A", email: "a@t" }]]),
    );

    expect(results).toEqual([
      { group: "", method: "listUsers", status: "pass", target: "response" },
    ]);
  });

  it("validates both the groups and the top-level endpoints of a mixed source", async () => {
    const users = defineGroup({
      prefix: "users",
      endpoints: { getAll: endpoint.get("").response(userSchema) },
    });
    const mixed = defineApi({
      baseURL: "https://api.test",
      groups: { users },
      endpoints: { health: endpoint.get("health").response(userSchema) },
    });

    const results = await validateSource(mixed, new Map([["health", {}]]));

    expect(results.map((r) => [r.group, r.method, r.status])).toEqual([
      ["users", "getAll", "skip"],
      ["", "health", "fail"],
    ]);
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
        withSchema: endpoint.get("").response(userSchema),
        noSchema: endpoint.get("bare"),
      },
    });

    const results = await validateSource(
      defineApi({ baseURL: "https://api.test", groups: { users } }),
      new Map(),
    );

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "skip")).toBe(true);
    expect(results.map((r) => r.method)).toEqual(["withSchema", "noSchema"]);
  });

  it("ignores a helper sitting in the group beside the endpoints", async () => {
    const users = defineGroup({
      prefix: "users",
      endpoints: { getAll: endpoint.get("").response(userSchema) },
    });
    const source = defineApi({ baseURL: "https://api.test", groups: { users } });
    Object.assign(source.options.groups.users, { helper: () => "not an endpoint" });

    const results = await validateSource(
      source,
      new Map([["users/getAll", { id: "1", name: "Alice", email: "a@t.com" }]]),
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.method).toBe("getAll");
    expect(results[0]?.status).toBe("pass");
  });
});
