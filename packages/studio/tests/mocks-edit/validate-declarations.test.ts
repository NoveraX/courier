import { describe, expect, it } from "vitest";

import type { MockDeclaration } from "../../src/server/mocks-edit/types";
import type { DeclarationState } from "../../src/server/mocks-edit/validate-declarations";
import { validateDeclarations } from "../../src/server/mocks-edit/validate-declarations";

const STATE: DeclarationState = {
  sourceKeys: ["users", "orders", "carts"],
  declaredKeys: ["users"],
  declaredPorts: new Map([[4000, "users"]]),
  studioPort: 6280,
  mocksFileName: "courier.mocks.ts",
};

const NO_SOURCE =
  "; a source your app only registers at runtime has to be added under sources first";
const BAD_KEY =
  "a key must be an identifier of 1 to 64 letters, digits, _ or $ that does not start with a digit";

function request(overrides: Partial<MockDeclaration> = {}): MockDeclaration {
  return {
    key: "orders",
    source: "orders",
    port: null,
    seedCount: 20,
    autoStart: true,
    ...overrides,
  };
}

describe("checking declarations against the project", () => {
  it("returns no errors for a mock the project can take", () => {
    expect(
      validateDeclarations(
        [request(), request({ key: "carts", source: "carts", port: 4100 })],
        STATE,
      ),
    ).toEqual([]);
  });

  it("refuses a source the config does not declare", () => {
    expect(validateDeclarations([request({ source: "payments" })], STATE)).toEqual([
      {
        index: 0,
        source: "payments",
        field: "source",
        message: `courier.config has no sources.payments${NO_SOURCE}`,
      },
    ]);
  });

  it("refuses a key the mocks file already declares, naming that file", () => {
    const state = { ...STATE, mocksFileName: "courier.mocks.mts" };

    expect(validateDeclarations([request({ key: "users" })], state)).toEqual([
      {
        index: 0,
        source: "orders",
        field: "key",
        message: "courier.mocks.mts already declares users",
      },
    ]);
  });

  it("refuses a key that differs from a declared one only in case, naming the declared one", () => {
    expect(validateDeclarations([request({ key: "USERS" })], STATE)).toEqual([
      {
        index: 0,
        source: "orders",
        field: "key",
        message: "courier.mocks.ts already declares users",
      },
    ]);
  });

  it("refuses Studio's own port", () => {
    expect(validateDeclarations([request({ port: 6280 })], STATE)).toEqual([
      { index: 0, source: "orders", field: "port", message: "port 6280 is Studio's own" },
    ]);
  });

  it("accepts any port when Studio's port is not known", () => {
    expect(validateDeclarations([request({ port: 6280 })], { ...STATE, studioPort: null })).toEqual(
      [],
    );
  });

  it("refuses a port another mock holds, naming that mock", () => {
    expect(validateDeclarations([request({ port: 4000 })], STATE)).toEqual([
      { index: 0, source: "orders", field: "port", message: "port 4000 is users's" },
    ]);
  });

  it("reports a taken key once when the port it asks for is that mock's own", () => {
    expect(validateDeclarations([request({ key: "Users", port: 4000 })], STATE)).toEqual([
      {
        index: 0,
        source: "orders",
        field: "key",
        message: "courier.mocks.ts already declares users",
      },
    ]);
  });

  it("reports every problem of every declaration, in order, by its position", () => {
    const requests = [
      request({ key: "users", source: "payments", port: 6280 }),
      request({ key: "carts", source: "carts", port: 4000 }),
    ];

    expect(validateDeclarations(requests, STATE)).toEqual([
      {
        index: 0,
        source: "payments",
        field: "source",
        message: `courier.config has no sources.payments${NO_SOURCE}`,
      },
      {
        index: 0,
        source: "payments",
        field: "key",
        message: "courier.mocks.ts already declares users",
      },
      { index: 0, source: "payments", field: "port", message: "port 6280 is Studio's own" },
      { index: 1, source: "carts", field: "port", message: "port 4000 is users's" },
    ]);
  });

  it("tells apart two declarations of one source by their position", () => {
    const requests = [request({ key: "a", port: 4100 }), request({ key: "b", port: 6280 })];

    expect(validateDeclarations(requests, STATE)).toEqual([
      { index: 1, source: "orders", field: "port", message: "port 6280 is Studio's own" },
    ]);
  });
});

describe("checking each value on its own", () => {
  it.each(["", "1users", "user-mock", "user mock", "ключ", "a".repeat(65)])(
    "refuses the key %j",
    (key) => {
      expect(validateDeclarations([request({ key })], null)).toEqual([
        { index: 0, source: "orders", field: "key", message: BAD_KEY },
      ]);
    },
  );

  it.each(["$", "_users", "users2", "a".repeat(64)])("accepts the key %j", (key) => {
    expect(validateDeclarations([request({ key })], null)).toEqual([]);
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"])(
    "refuses the inherited name %s as a key",
    (key) => {
      expect(validateDeclarations([request({ key })], null)).toEqual([
        {
          index: 0,
          source: "orders",
          field: "key",
          message: `"${key}" is a name every object inherits, so it cannot be a key`,
        },
      ]);
    },
  );

  it.each(["", "s".repeat(201)])("refuses the source %j by its length", (source) => {
    expect(validateDeclarations([request({ source })], null)).toEqual([
      { index: 0, source, field: "source", message: "a source must be 1 to 200 characters long" },
    ]);
  });

  it.each(["s".repeat(200), "api/v1 · users", "ключи", "emoji 😀"])(
    "accepts the source %j",
    (source) => {
      expect(validateDeclarations([request({ source })], null)).toEqual([]);
    },
  );

  it.each(["\u0000users", "users\n", "a\tb", "users\u001f", "users\u007f", "users\u0085"])(
    "refuses control characters in the source %j",
    (source) => {
      expect(validateDeclarations([request({ source })], null)).toEqual([
        {
          index: 0,
          source,
          field: "source",
          message: "a source must not contain control characters",
        },
      ]);
    },
  );

  it.each(["a\ud800", "\udfff </script>", "x\udc00y"])(
    "refuses a source with an unpaired surrogate, which a file cannot hold: %j",
    (source) => {
      expect(validateDeclarations([request({ source })], null)).toEqual([
        {
          index: 0,
          source,
          field: "source",
          message: "a source must be well-formed Unicode text, without unpaired surrogates",
        },
      ]);
    },
  );

  it("refuses an inherited name as the source", () => {
    expect(validateDeclarations([request({ source: "toString" })], null)).toEqual([
      {
        index: 0,
        source: "toString",
        field: "source",
        message: '"toString" is a name every object inherits, so it cannot be a source',
      },
    ]);
  });

  it.each([0, 65536, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN])(
    "refuses the port %j",
    (port) => {
      expect(validateDeclarations([request({ port })], null)).toEqual([
        {
          index: 0,
          source: "orders",
          field: "port",
          message: "a port must be an integer from 1 to 65535",
        },
      ]);
    },
  );

  it.each([null, 1, 65535])("accepts the port %j", (port) => {
    expect(validateDeclarations([request({ port })], null)).toEqual([]);
  });

  it.each([0, 1001, 2.5, 2 ** 53])("refuses the seed count %j", (seedCount) => {
    expect(validateDeclarations([request({ seedCount })], null)).toEqual([
      {
        index: 0,
        source: "orders",
        field: "seedCount",
        message: "a seed count must be an integer from 1 to 1000",
      },
    ]);
  });

  it.each([1, 1000])("accepts the seed count %j", (seedCount) => {
    expect(validateDeclarations([request({ seedCount })], null)).toEqual([]);
  });

  it("checks a value before what the project holds, reporting one error per field", () => {
    expect(validateDeclarations([request({ source: "", port: 70000 })], STATE)).toEqual([
      {
        index: 0,
        source: "",
        field: "source",
        message: "a source must be 1 to 200 characters long",
      },
      { index: 0, source: "", field: "port", message: "a port must be an integer from 1 to 65535" },
    ]);
  });
});

describe("checking declarations against one another", () => {
  it("refuses a key the request already asks for, on the later declaration", () => {
    expect(validateDeclarations([request(), request({ source: "carts" })], null)).toEqual([
      {
        index: 1,
        source: "carts",
        field: "key",
        message: 'the request already asks for "orders"; keys must differ in more than letter case',
      },
    ]);
  });

  it("refuses keys that differ only in case", () => {
    expect(validateDeclarations([request(), request({ key: "Orders" })], null)).toEqual([
      {
        index: 1,
        source: "orders",
        field: "key",
        message: 'the request already asks for "orders"; keys must differ in more than letter case',
      },
    ]);
  });

  it("refuses a fixed port the request already asks for", () => {
    const requests = [
      request({ port: 4100 }),
      request({ key: "carts" }),
      request({ key: "users", port: 4100 }),
    ];

    expect(validateDeclarations(requests, null)).toEqual([
      {
        index: 2,
        source: "orders",
        field: "port",
        message: "orders in this request already asks for port 4100",
      },
    ]);
  });

  it("accepts any number of mocks whose port Studio assigns", () => {
    const requests = [request(), request({ key: "carts" }), request({ key: "payments" })];

    expect(validateDeclarations(requests, null)).toEqual([]);
  });

  it("checks nothing against the project when given no state", () => {
    expect(
      validateDeclarations([request({ key: "users", source: "payments", port: 6280 })], null),
    ).toEqual([]);
  });
});
