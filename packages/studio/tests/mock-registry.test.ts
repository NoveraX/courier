import type { CourierConfig } from "@noverax/courier/config";
import { defineApi } from "@noverax/courier/define";
import { describe, expect, it, vi } from "vitest";
import { createMockRegistry } from "../src/server/mock-registry";

const dummySource = defineApi({ baseURL: "https://api.example.com", groups: {} });

function makeConfig(mocks: Record<string, unknown> | undefined): CourierConfig {
  return { sources: { api: dummySource }, mocks } as unknown as CourierConfig;
}

describe("createMockRegistry", () => {
  it("emits onAdded for every entry on the first sync", () => {
    const events = { onAdded: vi.fn(), onChanged: vi.fn(), onRemoved: vi.fn() };
    const registry = createMockRegistry(events);
    const a = { id: "a" };
    const b = { id: "b" };
    registry.syncFromConfig(makeConfig({ first: a, second: b }));
    expect(events.onAdded).toHaveBeenCalledTimes(2);
    expect(events.onChanged).not.toHaveBeenCalled();
    expect(events.onRemoved).not.toHaveBeenCalled();
    expect(registry.getEntries()).toHaveLength(2);
  });

  it("emits onChanged when a definition reference changes", () => {
    const events = { onAdded: vi.fn(), onChanged: vi.fn(), onRemoved: vi.fn() };
    const registry = createMockRegistry(events);
    const v1 = { v: 1 };
    const v2 = { v: 2 };
    registry.syncFromConfig(makeConfig({ first: v1 }));
    registry.syncFromConfig(makeConfig({ first: v2 }));
    expect(events.onChanged).toHaveBeenCalledTimes(1);
    expect(events.onChanged).toHaveBeenCalledWith({ key: "first", definition: v2 });
  });

  it("emits no events when the same reference is re-synced", () => {
    const events = { onAdded: vi.fn(), onChanged: vi.fn(), onRemoved: vi.fn() };
    const registry = createMockRegistry(events);
    const same = { v: 1 };
    registry.syncFromConfig(makeConfig({ first: same }));
    events.onAdded.mockClear();
    registry.syncFromConfig(makeConfig({ first: same }));
    expect(events.onAdded).not.toHaveBeenCalled();
    expect(events.onChanged).not.toHaveBeenCalled();
  });

  it("emits onRemoved for keys that disappear", () => {
    const events = { onAdded: vi.fn(), onChanged: vi.fn(), onRemoved: vi.fn() };
    const registry = createMockRegistry(events);
    registry.syncFromConfig(makeConfig({ first: { v: 1 }, second: { v: 2 } }));
    registry.syncFromConfig(makeConfig({ first: { v: 1 } }));
    expect(events.onRemoved).toHaveBeenCalledWith("second");
    expect(registry.getEntries().map((e) => e.key)).toEqual(["first"]);
  });

  it("treats missing or undefined mocks as empty", () => {
    const events = { onAdded: vi.fn(), onChanged: vi.fn(), onRemoved: vi.fn() };
    const registry = createMockRegistry(events);
    registry.syncFromConfig(makeConfig(undefined));
    expect(registry.getEntries()).toEqual([]);
    expect(events.onAdded).not.toHaveBeenCalled();
  });

  it("skips null/undefined entry values", () => {
    const events = { onAdded: vi.fn(), onChanged: vi.fn(), onRemoved: vi.fn() };
    const registry = createMockRegistry(events);
    registry.syncFromConfig(makeConfig({ first: null, second: { v: 1 } }));
    expect(registry.getEntries().map((e) => e.key)).toEqual(["second"]);
  });
});
