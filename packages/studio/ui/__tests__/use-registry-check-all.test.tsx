/**
 * @vitest-environment jsdom
 */
/**
 * Checking every import for updates: an import whose check failed says why,
 * and a check that fails as a whole says so on every import rather than
 * leaving none with a status.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn() }));

import { post } from "@/lib/api-client";
import { useStudioStore } from "@/store";
import { useRegistry } from "../src/views/apis/use-registry";

const PETS = {
  name: "pets",
  baseURL: "https://pets.example",
  filePath: "src/api/pets/source.ts",
  groups: [],
  isImported: true,
  hasClient: true,
};

beforeEach(() => {
  useStudioStore.setState({ scanSources: [PETS], registrySources: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("checking every import for updates", () => {
  it("marks an import whose check failed as failed, with the reason", async () => {
    vi.mocked(post).mockResolvedValueOnce({
      results: { pets: { changed: false, error: "The host did not answer." } },
    });
    const { result } = renderHook(() => useRegistry());

    await act(() => result.current.checkAll());

    expect(result.current.statuses.pets).toEqual({
      status: "error",
      error: "The host did not answer.",
    });
  });

  it("marks an import with no URL as not checked, with why, never as up to date", async () => {
    const why = "A file import has no URL to check; upload its specification in Manage to compare.";
    vi.mocked(post).mockResolvedValueOnce({
      results: { pets: { changed: false, unchecked: why } },
    });
    const { result } = renderHook(() => useRegistry());

    await act(() => result.current.checkAll());

    expect(result.current.statuses.pets).toEqual({ status: "unchecked", error: why });
  });

  it("says on every import why the check failed as a whole", async () => {
    vi.mocked(post).mockRejectedValueOnce(new Error("Studio is not reachable."));
    const { result } = renderHook(() => useRegistry());

    await act(() => result.current.checkAll());

    expect(result.current.statuses.pets).toEqual({
      status: "error",
      error: "Studio is not reachable.",
    });
  });
});
