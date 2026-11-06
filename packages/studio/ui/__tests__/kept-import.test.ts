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

  it("is not an address that carries a credential, which every page of the project would be shown", () => {
    expect(keptImport("url", "https://ana:pw@api.example/openapi.json")).toBeNull();
    expect(keptImport("url", "https://api.example/openapi.json?api_key=k3y-9f2c")).toBeNull();
    expect(readKeptImport({ source: "url", content: "https://ana:pw@api.example/x" })).toBeNull();
    expect(keptImport("url", "https://api.example/openapi.json?page=2")).toEqual({
      source: "url",
      content: "https://api.example/openapi.json?page=2",
    });
  });

  it.each([
    "https://ana:pw@api.test/openapi.json",
    "HTTPS://ana:pw@api.test/openapi.json",
    "https://ana%40corp:pw@api.test/openapi.json",
    "https://ana:pw@[::1]:8443/openapi.json",
    " https://ana:pw@api.test/openapi.json",
    "\thttps://ana:pw@api.test/openapi.json",
    "https:/ana:pw@api.test/openapi.json",
    "https:\\\\ana:pw@api.test/openapi.json",
    "https:\\\\deploy:Zq9x-made-up-secret-77@api.example.com/openapi.json",
    "https:ana:pw@api.test/openapi.json",
  ])(
    "is not an address a URL parser reads a user and a password in, however spelled: %j",
    (address) => {
      expect(new URL(address).password).not.toBe("");
      expect(keptImport("url", address)).toBeNull();
      expect(readKeptImport({ source: "url", content: address })).toBeNull();
    },
  );
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
