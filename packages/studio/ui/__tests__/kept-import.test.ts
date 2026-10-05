/**
 * @vitest-environment jsdom
 *
 * An API import left unfinished opens again with the address or the small
 * spec typed, until a write ends it; a file is picked again.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn() }));

import { keptImport, readKeptImport, useKeptImport } from "@/apis/kept-import";
import { useImport } from "@/apis/use-import";

const URL_TYPED = "https://api.example/openapi.json";

beforeEach(() => {
  useKeptImport.setState({ kept: null });
});

describe("what of an unfinished import is kept", () => {
  it("is an address, or a small pasted spec — not a file, an empty field or a large spec", () => {
    expect(keptImport("url", URL_TYPED)).toEqual({ source: "url", content: URL_TYPED });
    expect(keptImport("raw", "openapi: 3.1.0")).toEqual({
      source: "raw",
      content: "openapi: 3.1.0",
    });
    expect(keptImport("file", "openapi: 3.1.0")).toBeNull();
    expect(keptImport("url", "  ")).toBeNull();
    expect(keptImport("raw", "x".repeat(70_000))).toBeNull();
    expect(readKeptImport({ source: "file", content: "x" })).toBeNull();
  });
});

describe("the import wizard", () => {
  it("opens again with what was typed, and fresh for another source", () => {
    const { result } = renderHook(() => useImport());
    act(() => result.current.openWizard());
    act(() => result.current.setContent(URL_TYPED));
    act(() => result.current.close());

    act(() => result.current.openWizard());
    expect(result.current.state).toMatchObject({ source: "url", content: URL_TYPED });

    act(() => result.current.openWizard("raw"));
    expect(result.current.state).toMatchObject({ source: "raw", content: "" });
  });
});
