/**
 * Whether a load of the edited files is the edit Studio meant: the file it
 * wrote, each requested mock present as a definition serving the config's
 * own source object, no mock lost, the sources unchanged.
 */
import { describe, expect, it } from "vitest";

import type { LoadedCourierConfig } from "../../src/server/config-loader";
import { rejectionOf } from "../../src/server/mocks-edit/rejection-of";

const ROOT = "/p";
const FILE = "/p/courier.mocks.ts";
const api = { name: "api" };
const billing = { name: "billing" };

function loaded(entries: Record<string, unknown>, sources: Record<string, unknown> = { api, billing }): LoadedCourierConfig {
  return {
    config: { sources } as unknown as LoadedCourierConfig["config"],
    configFile: "/p/courier.config.ts",
    contentHash: null,
    deps: [],
    depHashes: new Map(),
    mocks: { file: FILE, entries, contentHash: null, error: null },
  };
}

const mock = (source: unknown) => ({ __type: "courier-mock-server", source });
const request = { key: "apiMock", source: "api", port: null, seedCount: 20, autoStart: false };

describe("rejectionOf", () => {
  it("accepts a load that holds the requested mock serving the config's source", () => {
    const before = loaded({ first: mock(billing) });
    const after = loaded({ first: mock(billing), apiMock: mock(api) });

    expect(rejectionOf(before, after, [request], FILE, ROOT)).toBeNull();
  });

  it("rejects a mocks file that does not load", () => {
    const after = loaded({});
    after.mocks.error = new Error("Unexpected token");

    expect(rejectionOf(loaded({}), after, [request], FILE, ROOT)).toBe("the mocks file does not load: Unexpected token");
  });

  it("rejects a load of another mocks file than the one written", () => {
    const after = loaded({ apiMock: mock(api) });
    after.mocks.file = "/p/courier.mocks.mts";

    expect(rejectionOf(loaded({}), after, [request], FILE, ROOT)).toBe(
      "Studio loaded courier.mocks.mts rather than courier.mocks.ts",
    );
  });

  it("rejects a load where the requested mock is missing", () => {
    expect(rejectionOf(loaded({}), loaded({}), [request], FILE, ROOT)).toBe("apiMock is not declared after the edit");
  });

  it("rejects a requested mock that is not a definition", () => {
    const after = loaded({ apiMock: { source: api } });

    expect(rejectionOf(loaded({}), after, [request], FILE, ROOT)).toBe("apiMock is not a defineMockServer() definition");
  });

  it("rejects a mock serving an equal but different source object", () => {
    const after = loaded({ apiMock: mock({ name: "api" }) });

    expect(rejectionOf(loaded({}), after, [request], FILE, ROOT)).toBe("apiMock does not serve the config's sources.api");
  });

  it("does not take an inherited name for a declared mock", () => {
    const after = loaded({});

    expect(rejectionOf(loaded({}), after, [{ ...request, key: "toString" }], FILE, ROOT)).toBe(
      "toString is not declared after the edit",
    );
  });

  it("rejects a load that dropped a mock declared before", () => {
    const before = loaded({ first: mock(billing) });
    const after = loaded({ apiMock: mock(api) });

    expect(rejectionOf(before, after, [request], FILE, ROOT)).toBe("the edit would drop first");
  });

  it("rejects a load whose config no longer has the requested mock's source", () => {
    const after = loaded({ apiMock: mock(api) }, { billing });

    expect(rejectionOf(loaded({}), after, [request], FILE, ROOT)).toBe("courier.config no longer has sources.api");
  });

  it("rejects a requested mock declared as something other than an object", () => {
    const after = loaded({ apiMock: 42 });

    expect(rejectionOf(loaded({}), after, [request], FILE, ROOT)).toBe("apiMock is not a defineMockServer() definition");
  });

  it("names the files relative to the project", () => {
    const after = loaded({ apiMock: mock(api) });
    after.mocks.error = new Error("ParseError: Unexpected token \n /p/courier.mocks.ts:3:2");

    expect(rejectionOf(loaded({}), after, [request], FILE, ROOT)).toBe(
      "the mocks file does not load: ParseError: Unexpected token courier.mocks.ts:3:2",
    );
  });

  it("rejects a load whose config lost a source meanwhile", () => {
    const before = loaded({});
    const after = loaded({ apiMock: mock(api) }, { api });

    expect(rejectionOf(before, after, [request], FILE, ROOT)).toBe("the config's sources changed while Studio was editing");
  });
});
