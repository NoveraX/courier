/**
 * What the mock wizard proposes and checks while the user types, by the
 * rules Studio applies to a declaration: the key it suggests for a source,
 * the problems it shows on each field, and what it sends.
 */
import { describe, expect, it } from "vitest";
import { suggestMockKey } from "../src/features/mocks/wizard/suggest-mock-key";
import { toDeclarations } from "../src/features/mocks/wizard/to-declarations";
import type { MockDraft } from "../src/features/mocks/wizard/types";
import { validateDrafts } from "../src/features/mocks/wizard/validate-drafts";

function draft(patch: Partial<MockDraft> = {}): MockDraft {
  return {
    source: "api",
    key: "api",
    portMode: "auto",
    portText: "",
    seedCountText: "20",
    autoStart: true,
    answers: "all",
    endpoints: [],
    data: "generated",
    ...patch,
  };
}

const PROJECT = { sourceKeys: ["api", "billing"], declaredKeys: [] };

describe("key suggestions", () => {
  it("suggests the source's name, then <name>Mock, <name>Mock2 when taken, ignoring letter case", () => {
    expect(suggestMockKey("api", [])).toBe("api");
    expect(suggestMockKey("api", ["API"])).toBe("apiMock");
    expect(suggestMockKey("api", ["api", "apimock"])).toBe("apiMock2");
    expect(suggestMockKey("api", ["api", "apiMock", "apiMock2"])).toBe("apiMock3");
  });

  it("makes a source name that is not an identifier into one", () => {
    expect(suggestMockKey("my-api", [])).toBe("myApi");
    expect(suggestMockKey("2fa", [])).toBe("_2fa");
    expect(suggestMockKey("petstore v2", [])).toBe("petstoreV2");
    expect(suggestMockKey("—", [])).toBe("mock");
    expect(suggestMockKey("a".repeat(80), ["a".repeat(64)])).toBe(`${"a".repeat(60)}Mock`);
  });

  it("never suggests a name every object inherits", () => {
    expect(suggestMockKey("constructor", [])).toBe("constructorMock");
    expect(suggestMockKey("__proto__", [])).toBe("__proto__Mock");
    expect(suggestMockKey("toString", [])).toBe("toStringMock");
  });

  it("suggests keys that pass the checks the wizard applies", () => {
    for (const source of ["api", "my-api", "2fa", "constructor", "x".repeat(90)]) {
      const key = suggestMockKey(source, []);
      expect(validateDrafts([draft({ source: "api", key })], PROJECT).size).toBe(0);
    }
  });
});

describe("draft checks", () => {
  it("refuses a key that is not an identifier, is too long, or names an inherited member", () => {
    for (const key of ["", "my-api", "2fa", "a".repeat(65), "ключ"]) {
      expect(validateDrafts([draft({ key })], PROJECT).get(0)?.key).toMatch(
        /must be an identifier/,
      );
    }
    for (const key of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(validateDrafts([draft({ key })], PROJECT).get(0)?.key).toMatch(
        /every object inherits/,
      );
    }
  });

  it("refuses a key another new mock has or a mock already declares, ignoring letter case", () => {
    const twice = validateDrafts(
      [draft({ key: "Api" }), draft({ source: "billing", key: "api" })],
      PROJECT,
    );
    expect(twice.get(0)).toBeUndefined();
    expect(twice.get(1)?.key).toBe(
      'another new mock is named "Api"; keys must differ in more than letter case',
    );

    const declared = validateDrafts([draft({ key: "API" })], { ...PROJECT, declaredKeys: ["api"] });
    expect(declared.get(0)?.key).toBe("a mock named api is already declared");
  });

  it("reports a draft whose source the config does not declare", () => {
    expect(validateDrafts([draft({ source: "gone", key: "gone" })], PROJECT).get(0)?.source).toBe(
      "courier.config has no sources.gone",
    );
  });

  it("reports a cleared or malformed fixed port instead of replacing it, and one asked for twice", () => {
    for (const portText of ["", "0", "65536", "7001abc", "1e3", "-1", "70.5"]) {
      expect(validateDrafts([draft({ portMode: "fixed", portText })], PROJECT).get(0)?.port).toBe(
        "a port must be a whole number from 1 to 65535",
      );
    }
    const twice = validateDrafts(
      [
        draft({ portMode: "fixed", portText: "7001" }),
        draft({ source: "billing", key: "billing", portMode: "fixed", portText: "7001" }),
      ],
      PROJECT,
    );
    expect(twice.get(1)?.port).toBe("api in this request already asks for port 7001");
    expect(validateDrafts([draft({ portMode: "auto", portText: "garbage" })], PROJECT).size).toBe(
      0,
    );
  });

  it("refuses records per collection outside 1 to 1000", () => {
    for (const seedCountText of ["", "0", "1001", "20.5", "abc"]) {
      expect(validateDrafts([draft({ seedCountText })], PROJECT).get(0)?.seedCount).toBe(
        "records per collection must be a whole number from 1 to 1000",
      );
    }
    expect(validateDrafts([draft({ seedCountText: "1000" })], PROJECT).size).toBe(0);
  });
});

describe("what is sent", () => {
  it("sends each mock as Studio's declaration: an automatic port as null, numbers as typed", () => {
    const sent = toDeclarations([
      draft({ portText: "9999" }),
      draft({
        source: "billing",
        key: "billingMock",
        portMode: "fixed",
        portText: " 7002 ",
        seedCountText: "5",
        autoStart: false,
      }),
    ]);

    expect(sent).toEqual([
      { key: "api", source: "api", port: null, seedCount: 20, autoStart: true },
      { key: "billingMock", source: "billing", port: 7002, seedCount: 5, autoStart: false },
    ]);
  });

  it("sends nothing while a number typed is not one in range", () => {
    expect(toDeclarations([draft({ portMode: "fixed", portText: "" })])).toBeNull();
    expect(toDeclarations([draft({ seedCountText: "0" })])).toBeNull();
  });
});

describe("a mock that answers some endpoints, with recordings", () => {
  it("sends the endpoints picked and a recordings file named after the mock", () => {
    const partial = draft({ answers: "some", endpoints: ["orders.refund"], data: "recorded" });

    expect(toDeclarations([partial])).toEqual([
      {
        key: "api",
        source: "api",
        port: null,
        seedCount: 20,
        autoStart: true,
        endpoints: ["orders.refund"],
        fixtures: "./fixtures/api.har",
      },
    ]);
  });

  it("sends neither while the mock answers every endpoint with generated data", () => {
    const [declaration] = toDeclarations([draft({ endpoints: ["orders.refund"] })]) ?? [];

    expect(declaration).not.toHaveProperty("endpoints");
    expect(declaration).not.toHaveProperty("fixtures");
  });

  it("asks for an endpoint while none is picked", () => {
    expect(validateDrafts([draft({ answers: "some" })], PROJECT).get(0)).toEqual({
      endpoints: "pick at least one endpoint, or let the mock answer every one",
    });
  });
});
