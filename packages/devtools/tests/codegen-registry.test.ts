import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addSource,
  computeSpecHash,
  getSource,
  hasSpecChanged,
  listSources,
  loadRegistry,
  removeSource,
  saveRegistry,
  updateFingerprints,
} from "../src/codegen/registry/registry";
import type { RegistryConfig } from "../src/codegen/merge/types";
import type { ParsedSpec } from "../src/codegen/parser/types";
import { DEFAULT_OPTIONS } from "../src/codegen/generator/types";

const TEST_CONFIG_PATH = join(import.meta.dirname, ".tmp-test-registry.json");

afterEach(() => {
  if (existsSync(TEST_CONFIG_PATH)) {
    rmSync(TEST_CONFIG_PATH);
  }
});

function makeSpec(overrides: Partial<ParsedSpec> = {}): ParsedSpec {
  return {
    title: "Test API",
    version: "1.0.0",
    description: "",
    baseURL: "/api",
    format: "openapi3",
    groups: [],
    schemas: {},
    securitySchemes: [],
    ...overrides,
  };
}

// ── loadRegistry / saveRegistry ─────────────────────────────────────────────

describe("loadRegistry", () => {
  it("returns empty config when file does not exist", () => {
    const config = loadRegistry(TEST_CONFIG_PATH);
    expect(config).toEqual({ sources: {} });
  });

  it("loads saved config from disk", () => {
    const config: RegistryConfig = {
      sources: {
        api: {
          specSource: { type: "url", value: "https://example.com/spec.json" },
          specHash: "abc123",
          specVersion: "1.0.0",
          lastSynced: "2026-01-01T00:00:00Z",
          outputDir: "src/api",
          options: DEFAULT_OPTIONS,
          endpoints: {},
        },
      },
    };
    saveRegistry(config, TEST_CONFIG_PATH);
    const loaded = loadRegistry(TEST_CONFIG_PATH);
    expect(loaded.sources.api?.specVersion).toBe("1.0.0");
  });
});

describe("saveRegistry", () => {
  it("writes config to disk with pretty JSON", () => {
    const config: RegistryConfig = { sources: {} };
    saveRegistry(config, TEST_CONFIG_PATH);
    const raw = readFileSync(TEST_CONFIG_PATH, "utf-8");
    expect(raw).toContain("{\n");
    expect(raw.endsWith("\n")).toBe(true);
  });
});

// ── CRUD ────────────────────────────────────────────────────────────────────

describe("addSource", () => {
  it("adds a new source to config", () => {
    let config: RegistryConfig = { sources: {} };
    const spec = makeSpec();
    const fingerprints = {
      getAll: { hash: "abc123", userModified: false },
    };

    config = addSource(
      config,
      "petstore",
      spec,
      { type: "url" as const, value: "https://petstore.io/spec.json" },
      DEFAULT_OPTIONS,
      fingerprints,
    );

    expect(config.sources.petstore).toBeDefined();
    expect(config.sources.petstore?.specVersion).toBe("1.0.0");
    expect(config.sources.petstore?.endpoints.getAll?.hash).toBe("abc123");
  });

  it("overwrites existing source with same name", () => {
    let config: RegistryConfig = { sources: {} };
    const spec1 = makeSpec({ version: "1.0.0" });
    const spec2 = makeSpec({ version: "2.0.0" });

    config = addSource(config, "api", spec1, { type: "url", value: "https://a.com" }, DEFAULT_OPTIONS, {});
    config = addSource(config, "api", spec2, { type: "url", value: "https://a.com" }, DEFAULT_OPTIONS, {});

    expect(config.sources.api?.specVersion).toBe("2.0.0");
  });
});

describe("removeSource", () => {
  it("removes a source from config", () => {
    let config: RegistryConfig = { sources: {} };
    config = addSource(config, "api", makeSpec(), { type: "url", value: "https://a.com" }, DEFAULT_OPTIONS, {});
    expect(getSource(config, "api")).toBeDefined();

    config = removeSource(config, "api");
    expect(getSource(config, "api")).toBeUndefined();
  });

  it("does not throw when removing non-existent source", () => {
    const config: RegistryConfig = { sources: {} };
    const result = removeSource(config, "nonexistent");
    expect(result.sources).toEqual({});
  });
});

describe("getSource", () => {
  it("returns source by name", () => {
    let config: RegistryConfig = { sources: {} };
    config = addSource(config, "api", makeSpec(), { type: "url", value: "https://a.com" }, DEFAULT_OPTIONS, {});
    expect(getSource(config, "api")?.specVersion).toBe("1.0.0");
  });

  it("returns undefined for unknown source", () => {
    expect(getSource({ sources: {} }, "nope")).toBeUndefined();
  });
});

describe("listSources", () => {
  it("lists all sources with summary", () => {
    let config: RegistryConfig = { sources: {} };
    config = addSource(config, "api", makeSpec(), { type: "url", value: "https://a.com" }, DEFAULT_OPTIONS, {
      getAll: { hash: "a", userModified: false },
      create: { hash: "b", userModified: true },
    });
    config = addSource(config, "cms", makeSpec({ version: "2.0.0" }), { type: "file", value: "./cms.json" }, DEFAULT_OPTIONS, {});

    const list = listSources(config);
    expect(list).toHaveLength(2);

    const api = list.find((s) => s.name === "api");
    expect(api?.endpointCount).toBe(2);
    expect(api?.modifiedCount).toBe(1);

    const cms = list.find((s) => s.name === "cms");
    expect(cms?.version).toBe("2.0.0");
  });
});

// ── Update Detection ────────────────────────────────────────────────────────

describe("computeSpecHash", () => {
  it("returns a 32-char hex string", () => {
    const hash = computeSpecHash(makeSpec());
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns same hash for same spec", () => {
    const spec = makeSpec();
    expect(computeSpecHash(spec)).toBe(computeSpecHash(spec));
  });

  it("returns different hash for different spec", () => {
    const a = computeSpecHash(makeSpec({ version: "1.0.0" }));
    const b = computeSpecHash(makeSpec({ version: "2.0.0" }));
    expect(a).not.toBe(b);
  });
});

describe("hasSpecChanged", () => {
  it("returns false when spec has not changed", () => {
    const spec = makeSpec();
    let config: RegistryConfig = { sources: {} };
    config = addSource(config, "api", spec, { type: "url", value: "https://a.com" }, DEFAULT_OPTIONS, {});
    expect(hasSpecChanged(config.sources.api!, spec)).toBe(false);
  });

  it("returns true when spec version changes", () => {
    const spec = makeSpec({ version: "1.0.0" });
    let config: RegistryConfig = { sources: {} };
    config = addSource(config, "api", spec, { type: "url", value: "https://a.com" }, DEFAULT_OPTIONS, {});

    const newSpec = makeSpec({ version: "2.0.0" });
    expect(hasSpecChanged(config.sources.api!, newSpec)).toBe(true);
  });
});

describe("updateFingerprints", () => {
  it("updates fingerprints and spec version", () => {
    let config: RegistryConfig = { sources: {} };
    const spec = makeSpec({ version: "1.0.0" });
    config = addSource(config, "api", spec, { type: "url", value: "https://a.com" }, DEFAULT_OPTIONS, {
      getAll: { hash: "old", userModified: false },
    });

    const newSpec = makeSpec({ version: "2.0.0" });
    config = updateFingerprints(config, "api", {
      getAll: { hash: "new", userModified: false },
      create: { hash: "new2", userModified: false },
    }, newSpec);

    const source = config.sources.api!;
    expect(source.specVersion).toBe("2.0.0");
    expect(source.endpoints.getAll?.hash).toBe("new");
    expect(source.endpoints.create?.hash).toBe("new2");
  });

  it("does nothing if source not found", () => {
    const config: RegistryConfig = { sources: {} };
    const result = updateFingerprints(config, "nonexistent", {}, makeSpec());
    expect(result.sources).toEqual({});
  });
});
