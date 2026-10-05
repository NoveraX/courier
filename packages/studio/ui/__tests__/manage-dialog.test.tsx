/**
 * @vitest-environment jsdom
 */
/**
 * The manage dialog as the user sees it: every refusal is said on the step
 * it leaves the user on, a plan Studio cannot apply offers nothing to allow
 * and is previewed again instead, and an apply under way can be neither
 * repeated nor cancelled.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn() }));

import { type UseManageReturn, useManage } from "@/apis/use-manage";
import type { ParsedSpec, SourceSummary } from "@/features/apis/types";
import { post } from "@/lib/api-client";
import { StudioRequestError } from "@/lib/studio-request-error";
import { ManageDialog } from "@/screens/apis/manage/manage-dialog";

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
  groups: [
    {
      name: "pets",
      prefix: "/pets",
      isCustomGroup: false,
      endpoints: [
        { group: "pets", name: "listPets", httpMethod: "get", path: "", status: "active" },
      ],
    },
  ],
  specChanged: false,
  totalActive: 1,
  totalAvailable: 0,
  totalCustom: 0,
};

const PLAN = {
  digest: "plan-1",
  dir: "src/api/pets",
  writes: [],
  removals: [],
  kept: [],
  pending: [
    { path: "src/api/pets/pets/index.ts", kind: "remove", reason: "edited", preselected: false },
  ],
  blocked: [],
  forgotten: [],
};

let manage: UseManageReturn;

function Harness(): React.ReactElement {
  manage = useManage();
  return <ManageDialog manage={manage} />;
}

function refusal(code: string, message: string): StudioRequestError {
  return new StudioRequestError(message, { error: message, code }, undefined);
}

async function toPreview(previewAnswer: () => Promise<unknown>): Promise<void> {
  vi.mocked(post).mockResolvedValueOnce(INVENTORY).mockImplementationOnce(previewAnswer);
  render(<Harness />);
  await act(async () => manage.start(SOURCE, SPEC));
  act(() => manage.toggleEndpoint("pets", "listPets", true));
  await act(() => manage.requestPreview());
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the manage dialog", () => {
  it("says why Studio refused the preview, on the endpoint list it returns to", async () => {
    await toPreview(() =>
      Promise.reject(refusal("DIR_OVERLAP", "Another import owns src/api/pets.")),
    );

    expect(manage.step).toBe("inventory");
    expect(screen.getByRole("alert").textContent).toBe("Another import owns src/api/pets.");
  });

  it("says why the endpoints could not be listed, instead of loading forever", async () => {
    vi.mocked(post).mockRejectedValueOnce(
      refusal("SPEC_NOT_GENERATED", "The spec could not be read."),
    );
    render(<Harness />);

    await act(async () => manage.start(SOURCE, SPEC));

    expect(manage.step).toBe("reupload");
    expect(screen.getByRole("alert").textContent).toBe("The spec could not be read.");
  });

  it("offers nothing to allow in a plan Studio cannot apply, and previews it again instead", async () => {
    const blocked = { ...PLAN, blocked: [{ path: "src/api/pets/pets", reason: "link" }] };
    await toPreview(async () => ({ plan: blocked }));

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Apply changes/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Preview again" })).toBeTruthy();
  });

  it("can be neither applied again nor cancelled while an apply is under way", async () => {
    await toPreview(async () => ({ plan: PLAN }));
    vi.mocked(post).mockReturnValueOnce(new Promise(() => {}));

    act(() => {
      void manage.apply();
    });

    const apply = screen.getByRole("button", { name: /Apply changes/ });
    expect(apply.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Later" }).hasAttribute("disabled")).toBe(true);
  });
});
