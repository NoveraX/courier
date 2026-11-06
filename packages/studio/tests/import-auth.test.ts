/**
 * An import's auth: read from a config, a request or the command line,
 * each credential a value the config computes or the environment variable
 * that holds it; sent as the headers it means, every value read when it is
 * sent and checked as `fetch` checks one; refused by the field, never by a
 * value; written into `courier.config.ts` as references alone; and shown
 * to no page, nor the credentials an import's address carries.
 */
import { describe, expect, it } from "vitest";

import { IMPORTS_STATE_VERSION } from "../src/apis/imports-state";
import { authFromFlags } from "../src/commands/import/auth-flags";
import { importEntry } from "../src/server/config-edit/render-config-entries";
import { ImportAuthError, readImportAuth } from "../src/server/import-auth";
import { importAuthHeaders } from "../src/server/import-auth-headers";
import { summarizeImports } from "../src/server/imports-bridge";
import { DEFAULT_STYLE } from "../src/server/mocks-edit/plan/detect-style";
import { seededRandom } from "./helpers/seeded-random";

/* Made up for the test. */
const ENV = { ORDERS_TOKEN: "t0k3n-made-up", SPEC_USER: "ana", SPEC_PASSWORD: "pw-made-up" };

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    if (err instanceof ImportAuthError) return err.code;
    throw err;
  }
  throw new Error("nothing was refused");
}

describe("the headers an import's auth sends", () => {
  it("reads each reference from the environment as it is sent", () => {
    expect(importAuthHeaders({ type: "bearer", token: { env: "ORDERS_TOKEN" } }, ENV)).toEqual({
      authorization: "Bearer t0k3n-made-up",
    });
    expect(
      importAuthHeaders(
        { type: "basic", username: { env: "SPEC_USER" }, password: { env: "SPEC_PASSWORD" } },
        ENV,
      ),
    ).toEqual({ authorization: `Basic ${Buffer.from("ana:pw-made-up").toString("base64")}` });
    expect(
      importAuthHeaders({ type: "header", headers: { "X-Api-Key": { env: "ORDERS_TOKEN" } } }, ENV),
    ).toEqual({ "X-Api-Key": "t0k3n-made-up" });
  });

  it("reads a variable the environment holds itself, never one its prototype answers for", () => {
    const run = () => importAuthHeaders({ type: "bearer", token: { env: "__proto__" } }, ENV);

    expect(codeOf(run)).toBe("SECRET_NOT_SET");
  });

  it("says a variable that is not set by its name", () => {
    const run = () => importAuthHeaders({ type: "bearer", token: { env: "MISSING_TOKEN" } }, ENV);

    expect(codeOf(run)).toBe("SECRET_NOT_SET");
    expect(run).toThrow("MISSING_TOKEN, which is not set");
  });

  it("refuses a value no request can carry, without repeating it", () => {
    const env = { LEAKY: "t0k3n\r\nX-Injected: 1" };
    const run = () => importAuthHeaders({ type: "bearer", token: { env: "LEAKY" } }, env);

    expect(codeOf(run)).toBe("HEADER_VALUE_INVALID");
    expect(run).not.toThrow(/t0k3n|Injected/);
  });
});

describe("an import's auth, read", () => {
  it("takes a reference where a request must give one, and refuses a value there", () => {
    expect(readImportAuth({ type: "bearer", token: { env: "ORDERS_TOKEN" } }, true)).toEqual({
      type: "bearer",
      token: { env: "ORDERS_TOKEN" },
    });
    expect(codeOf(() => readImportAuth({ type: "bearer", token: "t0k3n" }, true))).toBe(
      "SECRET_NOT_REFERENCED",
    );
    expect(readImportAuth({ type: "bearer", token: "computed" }, false)).toEqual({
      type: "bearer",
      token: "computed",
    });
  });

  it.each([
    ["a variable no name has", { type: "bearer", token: { env: "1TOKEN" } }, "SECRET_NAME_INVALID"],
    [
      "a header framing the request",
      { type: "header", headers: { host: { env: "A" } } },
      "HEADER_NOT_ALLOWED",
    ],
    [
      "a header no name has",
      { type: "header", headers: { "x y": { env: "A" } } },
      "HEADER_NAME_INVALID",
    ],
    ["no headers", { type: "header", headers: {} }, "AUTH_INVALID"],
    ["a type it does not have", { type: "digest" }, "AUTH_INVALID"],
    [
      "a reference with more than its name",
      { type: "bearer", token: { env: "A", value: "x" } },
      "AUTH_INVALID",
    ],
  ])("refuses %s", (_, raw, code) => {
    expect(codeOf(() => readImportAuth(raw, true))).toBe(code);
  });

  it("keeps a header named __proto__ an own header, not the prototype", () => {
    const auth = readImportAuth(
      JSON.parse('{"type":"header","headers":{"__proto__":{"env":"A"}}}'),
      true,
    );

    expect(auth.type === "header" && Object.hasOwn(auth.headers, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(auth.type === "header" ? auth.headers : {})).toBe(
      Object.prototype,
    );
  });
});

/* JSON of the auth's shape now and then, of any shape otherwise. */
function anyAuth(next: (below: number) => number, depth = 0): unknown {
  const words = [
    "bearer",
    "basic",
    "header",
    "env",
    "token",
    "username",
    "password",
    "headers",
    "type",
    "__proto__",
    "Host",
    "X-Api-Key",
    "A_1",
    "1A",
    "x y",
    "",
  ];
  const word = () => words[next(words.length)];
  const pick = next(depth > 2 ? 4 : 9);
  if (pick === 7) return { type: "bearer", token: { env: word() } };
  if (pick === 8)
    return { type: "header", headers: { [String(word())]: anyAuth(next, depth + 1) } };
  if (pick === 0) return word();
  if (pick === 1) return next(3) === 0 ? null : next(100);
  if (pick === 2) return { env: word() };
  if (pick === 3) return [anyAuth(next, depth + 1)];
  const record: Record<string, unknown> = { type: word() };
  for (let i = next(4); i > 0; i -= 1) {
    Object.defineProperty(record, String(word()), {
      value: anyAuth(next, depth + 1),
      enumerable: true,
      configurable: true,
    });
  }
  return record;
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

describe("an import's auth, read from anything a request may send", () => {
  it("is refused as an auth's error, or is an auth whose every credential names a variable", () => {
    let read = 0;
    for (let seed = 1; seed <= 2000; seed += 1) {
      const raw = anyAuth(seededRandom(seed));
      let auth: ReturnType<typeof readImportAuth>;
      try {
        auth = readImportAuth(raw, true);
      } catch (err) {
        expect(err, `seed ${seed}`).toBeInstanceOf(ImportAuthError);
        continue;
      }
      read += 1;
      const secrets =
        auth.type === "bearer"
          ? [auth.token]
          : auth.type === "basic"
            ? [auth.username, auth.password]
            : Object.values(auth.headers);
      for (const secret of secrets) {
        expect(typeof secret === "object" && ENV_NAME.test(secret.env), `seed ${seed}`).toBe(true);
      }
      if (auth.type === "header") {
        expect(Object.keys(auth.headers).every((name) => name.toLowerCase() !== "host")).toBe(true);
      }
    }
    expect(read).toBeGreaterThan(50);
  });
});

describe("the auth the command line names", () => {
  it("is the environment variables that hold each credential", () => {
    expect(authFromFlags({ "bearer-env": "ORDERS_TOKEN" })).toEqual({
      type: "bearer",
      token: { env: "ORDERS_TOKEN" },
    });
    expect(authFromFlags({ "basic-env": "SPEC_USER:SPEC_PASSWORD" })).toEqual({
      type: "basic",
      username: { env: "SPEC_USER" },
      password: { env: "SPEC_PASSWORD" },
    });
    expect(authFromFlags({ "header-env": "X-Api-Key=ORDERS_TOKEN, X-Tenant=TENANT" })).toEqual({
      type: "header",
      headers: { "X-Api-Key": { env: "ORDERS_TOKEN" }, "X-Tenant": { env: "TENANT" } },
    });
    expect(authFromFlags({})).toBeUndefined();
  });

  it("is one auth, and each part names a variable", () => {
    expect(() => authFromFlags({ "bearer-env": "A", "basic-env": "B:C" })).toThrow(
      "give one of them",
    );
    expect(() => authFromFlags({ "basic-env": "SPEC_USER" })).toThrow(
      "USER_VARIABLE:PASSWORD_VARIABLE",
    );
    expect(() => authFromFlags({ "header-env": "X-Api-Key" })).toThrow("Header=VARIABLE");
  });
});

describe("an import's auth in courier.config.ts", () => {
  it("is written as the environment variables that hold each credential", () => {
    const entry = {
      importType: "url" as const,
      type: "openapi" as const,
      from: "https://specs.example/orders.json",
      auth: { type: "header" as const, headers: { "X-Api-Key": { env: "ORDERS_TOKEN" } } },
      outputDir: "src/api",
    };

    expect(importEntry("orders", entry, DEFAULT_STYLE)("", false)).toBe(
      'orders: { importType: "url", type: "openapi", from: "https://specs.example/orders.json", auth: { type: "header", headers: { "X-Api-Key": { env: "ORDERS_TOKEN" } } }, outputDir: "src/api" }',
    );
  });
});

describe("an import shown to every page", () => {
  it("names where it is read from without the credentials the address carries, and no auth", () => {
    const [orders] = summarizeImports({
      declarations: {
        orders: {
          importType: "url",
          type: "openapi",
          from: "https://specs.example/orders.json?api_key=k3y-made-up-9f2c",
          auth: { type: "bearer", token: { env: "ORDERS_TOKEN" } },
          outputDir: "src/api",
        },
      },
      state: { version: IMPORTS_STATE_VERSION, imports: {}, applied: [] },
    });

    expect(orders?.specUrl).toContain("https://specs.example/orders.json");
    expect(JSON.stringify(orders)).not.toContain("k3y-made-up-9f2c");
    expect(JSON.stringify(orders)).not.toContain("ORDERS_TOKEN");
  });
});
