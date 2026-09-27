/**
 * @vitest-environment jsdom
 */
/**
 * Managing an import's endpoints applies the plan the preview showed: the
 * apply quotes it with the pending steps the user allowed, and a plan that
 * changed meanwhile replaces the one shown, with nothing allowed.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn() }));

import type { ParsedSpec, SourceSummary } from "../src/views/apis/types";

import { post } from "@/lib/api-client";
import { StudioRequestError } from "@/lib/studio-request-error";
import { useManage } from "../src/views/apis/use-manage";

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

const SOURCE: SourceSummary = {
  name: "pets",
  specUrl: "",
  importType: "file",
  outputDir: "src/api",
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
  },
};

const INVENTORY = {
  groups: [{ name: "pets", prefix: "/pets", isCustomGroup: false, endpoints: [
    { group: "pets", name: "listPets", httpMethod: "get", path: "", status: "active" },
  ] }],
  specChanged: false,
  totalActive: 1,
  totalAvailable: 0,
  totalCustom: 0,
};

const PLAN = {
  digest: "plan-1",
  dir: "src/api/pets",
  writes: [{ path: "src/api/pets/source.ts", action: "replace", was: "recorded" }],
  removals: [],
  kept: [],
  pending: [{ path: "src/api/pets/pets/index.ts", kind: "remove", reason: "edited", preselected: false }],
  blocked: [],
  forgotten: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function previewed(onSuccess?: (message: string) => void): Promise<{ current: ReturnType<typeof useManage> }> {
  vi.mocked(post)
    .mockResolvedValueOnce(INVENTORY)
    .mockResolvedValueOnce({ removeResult: { modifiedEndpointsWarning: [], orphanedSchemas: [] }, plan: PLAN });
  const { result } = renderHook(() => useManage(onSuccess));
  await act(async () => result.current.start(SOURCE, SPEC));
  act(() => result.current.toggleEndpoint("pets", "listPets", true));
  await act(() => result.current.requestPreview());
  return result;
}

describe("applying managed endpoints", () => {
  it("quotes the previewed plan with the steps the user allowed, and says what it did", async () => {
    const onSuccess = vi.fn();
    const result = await previewed(onSuccess);
    vi.mocked(post).mockResolvedValueOnce({
      written: ["src/api/pets/source.ts"],
      removed: ["src/api/pets/pets/index.ts"],
      kept: [],
      backupDir: ".courier/backups/1-a",
    });

    act(() => result.current.toggleConfirmed("src/api/pets/pets/index.ts"));
    await act(() => result.current.apply());

    expect(vi.mocked(post)).toHaveBeenLastCalledWith("/api/apis/manage/apply", {
      name: "pets",
      spec: SPEC,
      toAdd: {},
      toRemove: { pets: ["listPets"] },
      planDigest: "plan-1",
      confirm: ["src/api/pets/pets/index.ts"],
    });
    expect(result.current.open).toBe(false);
    expect(onSuccess).toHaveBeenCalledWith("Updated pets: wrote 1 file; removed 1 file, keeping a copy");
  });

  it("applies nothing while the preview of a new selection is on its way", async () => {
    const result = await previewed();
    vi.mocked(post).mockReturnValueOnce(new Promise(() => {}));

    act(() => {
      void result.current.requestPreview();
    });
    await act(() => result.current.apply());

    expect(result.current.consent).toBeNull();
    expect(vi.mocked(post)).not.toHaveBeenCalledWith("/api/apis/manage/apply", expect.anything());
  });

  it("shows the plan as it stands when the files changed, with nothing allowed", async () => {
    const result = await previewed();
    const changed = { ...PLAN, digest: "plan-2" };
    vi.mocked(post).mockRejectedValueOnce(
      new StudioRequestError("The files changed.", { error: "The files changed.", code: "PLAN_STALE", plan: changed }, undefined),
    );

    act(() => result.current.toggleConfirmed("src/api/pets/pets/index.ts"));
    await act(() => result.current.apply());

    expect(result.current.step).toBe("preview");
    expect(result.current.preview?.plan.digest).toBe("plan-2");
    expect(result.current.consent).toEqual({ plan: changed, confirmed: [] });
    expect(result.current.error).toBe("The files changed.");
  });
});
