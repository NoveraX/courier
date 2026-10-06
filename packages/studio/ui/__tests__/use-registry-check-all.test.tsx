/**
 * @vitest-environment jsdom
 */
/**
 * Checking every import for updates: an import whose check failed says why,
 * and a check that fails as a whole says so on every import rather than
 * leaving none with a status. The outcome Studio keeps comes with the
 * imports list, so a page opened after a check shows it, and a list Studio
 * sends after a check replaces the page's own answer.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn() }));

import { post } from "@/lib/api-client";
import { useStudioStore } from "@/store";
import { useRegistry } from "../src/apis/use-registry";

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
      checkedAt: expect.any(Number),
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

const SUMMARY = {
  name: "pets",
  specUrl: "https://pets.example/openapi.json",
  importType: "url" as const,
  outputDir: "src/api",
  options: {},
};

describe("the outcome Studio keeps", () => {
  it("shows on a page opened after the check", () => {
    const check = { status: "updates-available" as const, checkedAt: 1_000 };
    useStudioStore.setState({ registrySources: [{ ...SUMMARY, check }] });

    const { result } = renderHook(() => useRegistry());

    expect(result.current.statuses.pets).toEqual({
      status: "updates-available",
      error: undefined,
      checkedAt: 1_000,
    });
  });

  it("replaces the page's own answer once Studio sends the list anew", async () => {
    vi.mocked(post).mockResolvedValueOnce({ results: { pets: { changed: false } } });
    const { result } = renderHook(() => useRegistry());
    await act(() => result.current.checkAll());
    expect(result.current.statuses.pets?.status).toBe("up-to-date");

    const check = { status: "error" as const, checkedAt: 2_000, error: "The host did not answer." };
    act(() => useStudioStore.setState({ registrySources: [{ ...SUMMARY, check }] }));

    expect(result.current.statuses.pets).toMatchObject({ status: "error", error: check.error });
  });

  it("keeps showing a check under way, whatever list comes meanwhile", async () => {
    const answer = Promise.withResolvers<unknown>();
    vi.mocked(post).mockImplementationOnce(() => answer.promise);
    const { result } = renderHook(() => useRegistry());

    act(() => {
      void result.current.checkUpdates("pets");
    });
    act(() => useStudioStore.setState({ registrySources: [{ ...SUMMARY }] }));

    expect(result.current.statuses.pets?.status).toBe("checking");
    await act(async () => answer.resolve({ changed: true }));
    expect(result.current.statuses.pets?.status).toBe("updates-available");
  });
});
