/**
 * `binding-error-toast` surfaces a sonner toast on every `binding:error`
 * payload arriving from the Studio server. The component-level rendering
 * is owned by sonner; this suite verifies the helper formats the message
 * + description deterministically and never throws on edge cases.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import { showBindingErrorToast } from "../src/store/binding-error-toast";

beforeEach(() => {
  toastError.mockClear();
});

describe("showBindingErrorToast", () => {
  it("formats a conflict with a single claimant", () => {
    showBindingErrorToast({
      kind: "conflict",
      details: { sourceName: "api", transport: "http", runtimeIds: ["next-server"] },
    });
    expect(toastError).toHaveBeenCalledTimes(1);
    const [title, opts] = toastError.mock.calls[0] ?? [];
    expect(title).toBe("Binding conflict on api (http)");
    expect((opts as { description: string }).description).toContain("next-server");
  });

  it("joins multiple claimants in the description", () => {
    showBindingErrorToast({
      kind: "conflict",
      details: {
        sourceName: "users",
        transport: "ws",
        runtimeIds: ["rt-a", "rt-b", "rt-c"],
      },
    });
    const [title, opts] = toastError.mock.calls[0] ?? [];
    expect(title).toBe("Binding conflict on users (ws)");
    expect((opts as { description: string }).description).toContain("rt-a, rt-b, rt-c");
  });

  it("falls back to (unknown) when runtimeIds is empty", () => {
    showBindingErrorToast({
      kind: "conflict",
      details: { sourceName: "api", transport: "sse", runtimeIds: [] },
    });
    const [, opts] = toastError.mock.calls[0] ?? [];
    expect((opts as { description: string }).description).toContain("(unknown)");
  });
});
