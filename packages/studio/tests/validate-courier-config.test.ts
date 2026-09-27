import { describe, expect, it } from "vitest";
import type { ProjectInputs } from "../src/server/read-project-inputs";
import { validateCourierConfig } from "../src/server/validate-courier-config";

const CONFIG_FILE = "/project/courier.config.ts";
const DEP_HASHES: ProjectInputs = new Map([[CONFIG_FILE, "a".repeat(64)]]);
const API = { options: { baseURL: "https://api.example" } };

class SourceBag {
  readonly api = API;
}

function rejectionOf(config: unknown): unknown {
  try {
    validateCourierConfig(config, CONFIG_FILE, DEP_HASHES);
  } catch (err) {
    return err;
  }
  return null;
}

describe("validateCourierConfig", () => {
  it("accepts sources given as an object literal, an empty one included", () => {
    expect(rejectionOf({ sources: { api: API } })).toBeNull();
    expect(rejectionOf({ sources: {} })).toBeNull();
  });

  it("accepts sources with a null prototype, as a native module namespace has", () => {
    const namespace: Record<string, unknown> = Object.create(null);
    namespace.api = API;
    Object.defineProperty(namespace, Symbol.toStringTag, { value: "Module" });

    expect(rejectionOf({ sources: namespace })).toBeNull();
    expect(rejectionOf({ sources: Object.create(null) })).toBeNull();
  });

  it.each([
    ["a Map", new Map([["api", API]])],
    ["a Set", new Set([API])],
    ["a Promise", Promise.resolve({ api: API })],
    ["a Date", new Date(0)],
    ["an Error", new Error("sources")],
    ["an instance of SourceBag", new SourceBag()],
    ["an object with a prototype of its own", Object.create({ api: API })],
    ["an array", [API]],
    ["a function", () => ({ api: API })],
    ["a string", "api"],
  ])("rejects sources that are %s, naming what they are", (found, sources) => {
    expect(rejectionOf({ sources })).toMatchObject({
      code: "CONFIG_INVALID",
      message: `courier.config.sources is ${found}, not an object of named sources`,
      context: { configFile: CONFIG_FILE },
      depHashes: DEP_HASHES,
    });
  });

  it("rejects a config without sources, and one that is not an object", () => {
    expect(rejectionOf({})).toMatchObject({
      code: "CONFIG_INVALID",
      message: "courier.config.sources is required; declare `sources: {}` while there are none",
    });
    expect(rejectionOf({ sources: null })).toMatchObject({ code: "CONFIG_INVALID" });
    expect(rejectionOf("config")).toMatchObject({
      code: "CONFIG_INVALID",
      message: "courier.config must export an object",
    });
  });

  it("rejects an entry that is not a source, naming its key", () => {
    expect(rejectionOf({ sources: { api: API, billing: undefined } })).toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining("courier.config.sources.billing is undefined, not a source"),
    });
  });
});
