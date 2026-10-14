/**
 * Studio's advice on the traffic it saw: code that compiles as it is
 * copied, and hints that look at what they claim to.
 *
 * A suggestion imports only what Courier exports and calls only what a
 * builder has. "No caching detected" names the reads called often that the
 * cache never saw, not every endpoint called three times. "All requests use
 * direct mode" is not raised for a server, which has no secrets to keep
 * from a browser, and suggests a proxy caller that takes the routes Studio
 * writes rather than handing the whole definition to the browser.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IDEMPOTENCY_SUGGESTION } from "@/features/audit/code-suggestions";
import { runAudit } from "@/features/audit/run-audit";
import type { RequestEntry } from "@/store";

let dir = "";

beforeAll(() => {
  const cache = join(import.meta.dirname, "../../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  dir = mkdtempSync(join(cache, "suggestions-"));
  mkdirSync(join(dir, "api"));
  writeFileSync(
    join(dir, "api/sources.ts"),
    [
      `import { courier, defineApi } from "@noverax/courier/define";`,
      `const { endpoint } = courier();`,
      `export const api = defineApi({ name: "api", baseURL: "https://api.example.com", endpoints: { health: endpoint.get("health").response<unknown>().expose() } });`,
    ].join("\n"),
  );
  /* The routes module Studio writes beside the code, as a suggestion imports it. */
  writeFileSync(
    join(dir, "courier.routes.ts"),
    [
      `import type { CourierRoutes, RouteMap } from "@noverax/courier/define";`,
      `import type { api } from "./api/sources";`,
      `const endpoints = { health: { type: "query" } } as const satisfies RouteMap<typeof api>;`,
      `export const apiRoutes: CourierRoutes<typeof api, typeof endpoints> = { source: "api", endpoints };`,
    ].join("\n"),
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Type-check a snippet as the module a user pastes it into. */
function diagnosticsOf(name: string, code: string): string[] {
  const file = join(dir, `${name}.ts`);
  writeFileSync(file, code);
  const program = ts.createProgram([file], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

function request(i: number, fields: Partial<RequestEntry>): RequestEntry {
  return {
    id: `r${i}`,
    source: "api",
    group: "orders",
    method: "list",
    httpMethod: "GET",
    type: "query",
    variables: undefined,
    mode: "direct",
    status: "success",
    statusCode: 200,
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: i * 10,
    timing: { total: 10, middleware: 0, fetch: 10, validation: 0 },
    url: "https://api.example.com/orders",
    sessionId: "browser",
    ...fields,
  };
}

/** Traffic that sets off every rule with a code suggestion. */
function troubledTraffic(): RequestEntry[] {
  return [
    ...[0, 1, 2].map((i) => request(i, {})),
    ...[3, 4, 5].map((i) => request(i, { method: "flaky", status: "error", statusCode: 502 })),
    request(6, {
      method: "report",
      timing: { total: 6_000, middleware: 0, fetch: 6_000, validation: 0 },
    }),
    request(7, {
      method: "create",
      httpMethod: "POST",
      type: "mutation",
      variables: { sku: "a-1" },
    }),
    request(8, { method: "export", url: "https://api.example.com/export?token=secret" }),
  ];
}

describe("the code Studio suggests for a fix", () => {
  it("compiles as it is copied", () => {
    const items = runAudit(troubledTraffic(), {}, { browserSessions: new Set(["browser"]) }).items;
    const suggested = items.filter((item) => item.codeSuggestion !== undefined);

    expect(suggested.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "err-high-error-rate",
        "err-timeout",
        "err-sensitive-url",
        "sec-mutation-no-auth",
        "hint-no-caching",
        "hint-no-res-val",
        "hint-no-var-val",
        "warn-unused-proxy",
      ]),
    );
    for (const item of suggested) {
      expect({ id: item.id, errors: diagnosticsOf(item.id, item.codeSuggestion ?? "") }).toEqual({
        id: item.id,
        errors: [],
      });
    }
  }, 60_000);
});

describe("the fix for a retried write without an idempotency key", () => {
  it("compiles as it is copied, and declares the key", () => {
    expect(diagnosticsOf("courier-retry-mutation", IDEMPOTENCY_SUGGESTION)).toEqual([]);
    expect(IDEMPOTENCY_SUGGESTION).toContain('idempotencyKey: "header:Idempotency-Key"');
  }, 60_000);
});

/* The call each finding's fix turns on. */
const RECOMMENDS: Readonly<Record<string, string>> = {
  "err-high-error-rate": ".retry(",
  "err-timeout": ".timeout(",
  "err-sensitive-url": "authMiddleware(",
  "sec-mutation-no-auth": "authMiddleware(",
  "hint-no-caching": "cacheMiddleware(",
  "hint-no-res-val": ".response(z.",
  "hint-no-var-val": ".variables(z.",
  "warn-unused-proxy": "createProxyCaller",
};

describe("the code Studio suggests for a fix", () => {
  it("shows the call its finding recommends, not only the imports", () => {
    const items = runAudit(troubledTraffic(), {}, { browserSessions: new Set(["browser"]) }).items;

    for (const [id, call] of Object.entries(RECOMMENDS)) {
      const code = items.find((item) => item.id === id)?.codeSuggestion;
      expect({ id, shows: code?.includes(call) }).toEqual({ id, shows: true });
    }
  });
});

describe("the caching hint", () => {
  it("names the reads called often that the cache never saw", () => {
    const items = runAudit(troubledTraffic(), {}, { browserSessions: new Set() }).items;

    expect(
      items.find((item) => item.id === "hint-no-caching")?.endpoints?.map((e) => e.label),
    ).toEqual(["api.orders.list"]);
  });

  it("is not raised when the reads go through the cache", () => {
    const cached = [0, 1, 2].map((i) => request(i, { cache: { hit: i > 0 } }));

    const items = runAudit(cached, {}, { browserSessions: new Set() }).items;

    expect(items.find((item) => item.id === "hint-no-caching")).toBeUndefined();
  });
});

describe("the direct-mode warning", () => {
  it("is not raised for a server calling directly", () => {
    const fromServer = [0, 1, 2].map((i) => request(i, { sessionId: "server" }));

    const items = runAudit(fromServer, {}, { browserSessions: new Set(["browser"]) }).items;

    expect(items.find((item) => item.id === "warn-unused-proxy")).toBeUndefined();
  });

  it("suggests a proxy caller that takes the routes Studio writes", () => {
    const items = runAudit(troubledTraffic(), {}, { browserSessions: new Set(["browser"]) }).items;

    expect(items.find((item) => item.id === "warn-unused-proxy")?.codeSuggestion).toContain(
      "createProxyCaller(apiRoutes",
    );
  });
});
