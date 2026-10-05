/**
 * @vitest-environment jsdom
 *
 * Declaring a written import in courier.config from the wizard: Studio is
 * asked for the change once per write, the change applied quotes the hash
 * of the config it was shown against, and a config saved meanwhile shows
 * the change against it as it is now.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/apis/client-config-declare", () => ({
  previewConfigDeclare: vi.fn(),
  applyConfigDeclare: vi.fn(),
}));

import { applyConfigDeclare, previewConfigDeclare } from "@/apis/client-config-declare";
import { useConfigDeclare } from "@/apis/use-config-declare";
import type { ImportState, ParsedSpec } from "@/features/apis/types";

const SPEC: ParsedSpec = {
  title: "Pets",
  version: "1",
  description: "",
  baseURL: "https://pets.example",
  format: "openapi3",
  groups: [],
  schemas: {},
  securitySchemes: [],
  skipped: [],
};

const WRITTEN: ImportState = {
  step: "declare",
  source: "url",
  content: "https://specs.example/pets.json",
  spec: SPEC,
  options: {
    sourceName: "pets",
    outputDir: "src/api",
    validation: "zod",
    groupBy: "tag",
    generateTypes: true,
    generateSchemas: true,
    addAuthMiddleware: false,
    includeComments: true,
    generateClient: "direct",
    selectedEndpoints: null,
  },
  selectedEndpoints: {},
  generatedFiles: [],
  writing: false,
  declaration: { configFile: "courier.config.ts", source: null, importEntry: "x", leftOut: 0 },
  consent: null,
};

const READY = { status: "ready", configFile: "courier.config.ts", hunks: [], baseHash: "h1" };

beforeEach(() => {
  vi.mocked(previewConfigDeclare).mockReset();
  vi.mocked(applyConfigDeclare).mockReset();
});

describe("declaring a written import in courier.config", () => {
  it("asks Studio once per write, and applies the change it showed with that config's hash", async () => {
    vi.mocked(previewConfigDeclare).mockResolvedValue(READY);
    vi.mocked(applyConfigDeclare).mockResolvedValue({
      status: "applied",
      configFile: "courier.config.ts",
    });
    const { result, rerender } = renderHook(({ state }) => useConfigDeclare(state), {
      initialProps: { state: WRITTEN },
    });
    await waitFor(() => expect(result.current.answer?.status).toBe("ready"));

    rerender({ state: { ...WRITTEN } });
    await act(() => result.current.apply());

    expect(previewConfigDeclare).toHaveBeenCalledTimes(1);
    expect(applyConfigDeclare).toHaveBeenCalledWith(
      expect.objectContaining({ sourceName: "pets", specUrl: "https://specs.example/pets.json" }),
      "h1",
    );
    expect(result.current.answer).toEqual({ status: "applied", configFile: "courier.config.ts" });
  });

  it("shows the change against the config as it is now once it was saved after the preview", async () => {
    vi.mocked(previewConfigDeclare).mockResolvedValue(READY);
    vi.mocked(applyConfigDeclare).mockResolvedValue({
      status: "stale",
      preview: { ...READY, baseHash: "h2" },
    });
    const { result } = renderHook(() => useConfigDeclare(WRITTEN));
    await waitFor(() => expect(result.current.answer?.status).toBe("ready"));

    await act(() => result.current.apply());

    expect(result.current.answer).toMatchObject({ status: "ready", baseHash: "h2", stale: true });
  });

  it("asks nothing before the files are written", () => {
    const { result } = renderHook(() => useConfigDeclare({ ...WRITTEN, step: "preview" }));

    expect(previewConfigDeclare).not.toHaveBeenCalled();
    expect(result.current.answer).toBeNull();
  });

  it("says why when Studio could not be asked", async () => {
    vi.mocked(previewConfigDeclare).mockRejectedValue(new Error("Studio stopped"));

    const { result } = renderHook(() => useConfigDeclare(WRITTEN));

    await waitFor(() => expect(result.current.error).toBe("Studio stopped"));
    expect(result.current.answer).toBeNull();
  });
});
