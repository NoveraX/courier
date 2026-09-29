import { describe, expect, it, vi } from "vitest";
import { createMockRegistry } from "../src/server/mock-registry";

describe("createMockRegistry", () => {
  it("emits onAdded for every entry on the first sync", () => {
    const events = { onAdded: vi.fn(), onChanged: vi.fn(), onRemoved: vi.fn() };
    const registry = createMockRegistry(events);
    const a = { id: "a" };
    const b = { id: "b" };
    registry.syncFromMocks({ first: a, second: b });
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
    registry.syncFromMocks({ first: v1 });
    registry.syncFromMocks({ first: v2 });
    expect(events.onChanged).toHaveBeenCalledTimes(1);
    expect(events.onChanged).toHaveBeenCalledWith({ key: "first", definition: v2 });
  });

  it("emits no events when the same reference is re-synced", () => {
    const events = { onAdded: vi.fn(), onChanged: vi.fn(), onRemoved: vi.fn() };
    const registry = createMockRegistry(events);
    const same = { v: 1 };
    registry.syncFromMocks({ first: same });
    events.onAdded.mockClear();
    registry.syncFromMocks({ first: same });
    expect(events.onAdded).not.toHaveBeenCalled();
    expect(events.onChanged).not.toHaveBeenCalled();
  });

  it("emits onRemoved for keys that disappear", () => {
    const events = { onAdded: vi.fn(), onChanged: vi.fn(), onRemoved: vi.fn() };
    const registry = createMockRegistry(events);
    registry.syncFromMocks({ first: { v: 1 }, second: { v: 2 } });
    registry.syncFromMocks({ first: { v: 1 } });
    expect(events.onRemoved).toHaveBeenCalledWith("second");
    expect(registry.getEntries().map((e) => e.key)).toEqual(["first"]);
  });

  it("declares nothing for a mocks file that declares nothing", () => {
    const events = { onAdded: vi.fn(), onChanged: vi.fn(), onRemoved: vi.fn() };
    const registry = createMockRegistry(events);
    registry.syncFromMocks({});
    expect(registry.getEntries()).toEqual([]);
    expect(events.onAdded).not.toHaveBeenCalled();
  });

  it("skips null/undefined entry values", () => {
    const events = { onAdded: vi.fn(), onChanged: vi.fn(), onRemoved: vi.fn() };
    const registry = createMockRegistry(events);
    registry.syncFromMocks({ first: null, second: { v: 1 } });
    expect(registry.getEntries().map((e) => e.key)).toEqual(["second"]);
  });

  it("keeps a mock whose fingerprint is unchanged, though the load made its definition anew", () => {
    const events = { onAdded: vi.fn(), onChanged: vi.fn(), onRemoved: vi.fn() };
    const registry = createMockRegistry(events);
    registry.syncFromMocks(
      { users: { v: 1 }, pets: { v: 1 } },
      new Map([
        ["users", "u1"],
        ["pets", "p1"],
      ]),
    );

    const reloaded = { v: 1 };
    registry.syncFromMocks(
      { users: reloaded, pets: { v: 2 } },
      new Map([
        ["users", "u1"],
        ["pets", "p2"],
      ]),
    );

    expect(events.onChanged).toHaveBeenCalledTimes(1);
    expect(events.onChanged).toHaveBeenCalledWith({
      key: "pets",
      definition: { v: 2 },
      fingerprint: "p2",
    });
    expect(registry.getEntries().find((entry) => entry.key === "users")?.definition).toBe(reloaded);
  });

  it("counts a new definition as a change when either load has no fingerprint for it", () => {
    const events = { onAdded: vi.fn(), onChanged: vi.fn(), onRemoved: vi.fn() };
    const registry = createMockRegistry(events);
    registry.syncFromMocks({ users: { v: 1 } }, new Map([["users", "u1"]]));

    registry.syncFromMocks({ users: { v: 1 } });

    expect(events.onChanged).toHaveBeenCalledTimes(1);
  });
});
