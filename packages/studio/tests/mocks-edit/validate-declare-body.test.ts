import { describe, expect, it } from "vitest";

import { validateDeclareBody } from "../../src/server/mocks-edit/validate-declare-body";

const HASH = "0123456789abcdef".repeat(4);
const DIGEST = "fedcba9876543210".repeat(4);

function mock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: "users",
    source: "users",
    port: null,
    seedCount: 20,
    autoStart: true,
    ...overrides,
  };
}

function previewMessage(mocks: unknown): string | null {
  const result = validateDeclareBody({ mocks }, "preview");
  return result.ok ? null : result.message;
}

describe("reading a preview body", () => {
  it("returns the declarations with no hashes", () => {
    const body = { mocks: [mock(), mock({ key: "orders", source: "orders", port: 4000 })] };

    expect(validateDeclareBody(body, "preview")).toEqual({
      ok: true,
      value: {
        mocks: [
          { key: "users", source: "users", port: null, seedCount: 20, autoStart: true },
          { key: "orders", source: "orders", port: 4000, seedCount: 20, autoStart: true },
        ],
        baseHash: null,
        planDigest: null,
      },
    });
  });

  it("builds new objects rather than returning the ones it was given", () => {
    const entry = Object.assign(Object.create(null) as object, mock());
    const body = { mocks: [entry] };

    const result = validateDeclareBody(body, "preview");

    if (!result.ok) throw new Error(result.message);
    expect(result.value.mocks).not.toBe(body.mocks);
    expect(result.value.mocks[0]).not.toBe(entry);
    expect(Object.getPrototypeOf(result.value.mocks[0])).toBe(Object.prototype);
  });

  it.each([null, [], "mocks", 42, new Date(), new (class Body {})()])(
    "refuses a body that is not a plain object: %s",
    (body) => {
      expect(validateDeclareBody(body, "preview")).toEqual({
        ok: false,
        message: "the body must be a JSON object",
      });
    },
  );

  it("refuses a field it does not know", () => {
    expect(validateDeclareBody({ mocks: [mock()], extra: 1 }, "preview")).toEqual({
      ok: false,
      message: 'the body has an unknown field "extra"',
    });
  });

  it("refuses a __proto__ key that JSON.parse made an own field", () => {
    const body: unknown = JSON.parse(
      `{"mocks": [${JSON.stringify(mock())}], "__proto__": {"polluted": true}}`,
    );

    expect(validateDeclareBody(body, "preview")).toEqual({
      ok: false,
      message: 'the body has an unknown field "__proto__"',
    });
  });

  it("refuses a symbol key", () => {
    expect(validateDeclareBody({ mocks: [mock()], [Symbol("x")]: 1 }, "preview")).toEqual({
      ok: false,
      message: 'the body has an unknown field "Symbol(x)"',
    });
  });

  it("refuses the hashes an apply sends", () => {
    expect(validateDeclareBody({ mocks: [mock()], baseHash: null }, "preview")).toEqual({
      ok: false,
      message: 'the body has an unknown field "baseHash"',
    });
  });

  it("refuses a body without mocks", () => {
    expect(validateDeclareBody({}, "preview")).toEqual({ ok: false, message: "mocks is required" });
  });

  it.each([
    ["an object", { 0: mock() }],
    ["an empty array", []],
    ["21 mocks", Array.from({ length: 21 }, (_, index) => mock({ key: `m${index}` }))],
  ])("refuses mocks that are %s", (_, mocks) => {
    expect(previewMessage(mocks)).toBe("mocks must be an array of 1 to 20 mocks");
  });

  it("accepts 20 mocks", () => {
    expect(
      previewMessage(Array.from({ length: 20 }, (_, index) => mock({ key: `m${index}` }))),
    ).toBe(null);
  });
});

describe("reading each mock", () => {
  it.each([null, [], "users", 1])("refuses an entry that is not a plain object: %s", (entry) => {
    expect(previewMessage([mock(), entry])).toBe("mocks[1] must be a JSON object");
  });

  it("refuses a field it does not know", () => {
    expect(previewMessage([mock({ extra: true })])).toBe('mocks[0] has an unknown field "extra"');
  });

  it("refuses a __proto__ key that JSON.parse made an own field", () => {
    const mocks: unknown = JSON.parse(`[{"__proto__": {}, ${JSON.stringify(mock()).slice(1)}]`);

    expect(previewMessage(mocks)).toBe('mocks[0] has an unknown field "__proto__"');
  });

  it.each(["key", "source", "port", "seedCount", "autoStart"])("requires %s", (field) => {
    const entry = mock();
    delete entry[field];

    expect(previewMessage([entry])).toBe(`mocks[0].${field} is required`);
  });

  it.each([42, null, true, {}])("refuses a key that is not a string: %j", (key) => {
    expect(previewMessage([mock({ key })])).toBe("mocks[0].key must be a string");
  });

  it.each([7, null, ["users"]])("refuses a source that is not a string: %j", (source) => {
    expect(previewMessage([mock({ source })])).toBe("mocks[0].source must be a string");
  });

  it.each(["8080", true, {}])("refuses a port that is neither null nor a number: %j", (port) => {
    expect(previewMessage([mock(), mock({ key: "orders", port })])).toBe(
      "mocks[1].port must be null or a number",
    );
  });

  it.each([null, "20"])("refuses a seed count that is not a number: %j", (seedCount) => {
    expect(previewMessage([mock({ seedCount })])).toBe("mocks[0].seedCount must be a number");
  });

  it.each(["true", 1, null])("refuses autoStart %j", (autoStart) => {
    expect(previewMessage([mock({ autoStart })])).toBe("mocks[0].autoStart must be a boolean");
  });

  it("leaves the values to the check that reports them on each field", () => {
    const mocks = [
      mock({ key: "my-mock", source: "", port: 70000, seedCount: 0 }),
      mock({ key: "constructor", source: "a\ud800", port: 1.5, seedCount: 2 ** 53 }),
      mock({ key: "Users", port: 70000 }),
    ];

    expect(validateDeclareBody({ mocks }, "preview")).toEqual({
      ok: true,
      value: { mocks, baseHash: null, planDigest: null },
    });
  });

  it("reports the first entry that is wrong", () => {
    expect(previewMessage([mock(), mock({ key: 2 }), mock({ port: "0" })])).toBe(
      "mocks[1].key must be a string",
    );
  });
});

describe("reading an apply body", () => {
  it("returns the declarations with the hashes of the preview", () => {
    expect(
      validateDeclareBody({ mocks: [mock()], baseHash: HASH, planDigest: DIGEST }, "apply"),
    ).toEqual({
      ok: true,
      value: {
        mocks: [{ key: "users", source: "users", port: null, seedCount: 20, autoStart: true }],
        baseHash: HASH,
        planDigest: DIGEST,
      },
    });
  });

  it("accepts a null baseHash for a file the plan creates", () => {
    expect(
      validateDeclareBody({ mocks: [mock()], baseHash: null, planDigest: DIGEST }, "apply"),
    ).toEqual({
      ok: true,
      value: {
        mocks: [{ key: "users", source: "users", port: null, seedCount: 20, autoStart: true }],
        baseHash: null,
        planDigest: DIGEST,
      },
    });
  });

  it.each([
    [{ mocks: [mock()], planDigest: DIGEST }, "baseHash is required"],
    [{ mocks: [mock()], baseHash: HASH }, "planDigest is required"],
    [{ baseHash: HASH, planDigest: DIGEST }, "mocks is required"],
  ])("requires every field: %j", (body, message) => {
    expect(validateDeclareBody(body, "apply")).toEqual({ ok: false, message });
  });

  it.each([HASH.toUpperCase(), HASH.slice(1), `${HASH}0`, "g".repeat(64), 1, ""])(
    "refuses the baseHash %j",
    (baseHash) => {
      expect(
        validateDeclareBody({ mocks: [mock()], baseHash, planDigest: DIGEST }, "apply"),
      ).toEqual({ ok: false, message: "baseHash must be null or 64 lowercase hex characters" });
    },
  );

  it.each([null, DIGEST.toUpperCase(), DIGEST.slice(1), 1])(
    "refuses the planDigest %j",
    (planDigest) => {
      expect(validateDeclareBody({ mocks: [mock()], baseHash: HASH, planDigest }, "apply")).toEqual(
        {
          ok: false,
          message: "planDigest must be 64 lowercase hex characters",
        },
      );
    },
  );

  it("refuses a field it does not know", () => {
    const body = { mocks: [mock()], baseHash: HASH, planDigest: DIGEST, force: true };

    expect(validateDeclareBody(body, "apply")).toEqual({
      ok: false,
      message: 'the body has an unknown field "force"',
    });
  });

  it("refuses a __proto__ key that JSON.parse made an own field", () => {
    const body: unknown = JSON.parse(
      `{"mocks": [${JSON.stringify(mock())}], "baseHash": null, "planDigest": "${DIGEST}", "__proto__": null}`,
    );

    expect(validateDeclareBody(body, "apply")).toEqual({
      ok: false,
      message: 'the body has an unknown field "__proto__"',
    });
  });

  it("checks the mocks before the hashes", () => {
    const body = { mocks: [mock({ seedCount: "0" })], baseHash: 1, planDigest: null };

    expect(validateDeclareBody(body, "apply")).toEqual({
      ok: false,
      message: "mocks[0].seedCount must be a number",
    });
  });
});
