/**
 * @vitest-environment jsdom
 *
 * A pin made on a page with the token is kept in the project; one made on
 * a page without it stays on that page.
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const emit = vi.hoisted(() => vi.fn());
vi.mock("@/socket", () => ({ getSocket: () => ({ emit }) }));

import { useTogglePin } from "@/hooks/use-toggle-pin";
import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";

beforeEach(() => {
  emit.mockClear();
  useStudioStore.setState({ requests: [requestEntry({ id: "a" })] });
});

describe("pinning a request", () => {
  it("pins it here, and in the project for a page that may change it", () => {
    useStudioStore.setState({ projectWritable: true });
    const { result } = renderHook(() => useTogglePin());

    result.current("a");
    result.current("a");

    expect(emit.mock.calls).toEqual([
      ["requests:pin", { id: "a", pinned: true }],
      ["requests:pin", { id: "a", pinned: false }],
    ]);
  });

  it("pins it on this page alone for a page that may not", () => {
    useStudioStore.setState({ projectWritable: false });
    const { result } = renderHook(() => useTogglePin());

    result.current("a");

    expect(useStudioStore.getState().requests[0]?.pinned).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });
});
