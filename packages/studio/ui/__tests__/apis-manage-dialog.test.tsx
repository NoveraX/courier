/**
 * @vitest-environment jsdom
 *
 * Manage and Remove on the new shell, against Studio's answers: an
 * import's endpoints with what changed in its spec — new, dropped, edited,
 * custom — picked or not, those the spec dropped going with the update, the
 * files the change touches allowed one by one and applied; and an import
 * removed with what the config still says.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/lib/api-client", () => ({ post: vi.fn() }));

import type { ParsedSpec, SourceSummary } from "@/features/apis/types";
import { post } from "@/lib/api-client";
import { type UseManageReturn, useManage } from "../src/apis/use-manage";
import { type UseRemoveImportReturn, useRemoveImport } from "../src/apis/use-remove-import";
import { ManageDialog } from "../src/screens/apis/manage/manage-dialog";
import { RemoveImportDialog } from "../src/screens/apis/remove-import-dialog";

const SPEC: ParsedSpec = {
  title: "Pets",
  version: "2",
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
  specUrl: "https://pets.example/openapi.json",
  importType: "url",
  outputDir: "src/api",
  options: {},
};

const INVENTORY = {
  groups: [
    {
      name: "pets",
      prefix: "/pets",
      isCustomGroup: false,
      endpoints: [
        {
          group: "pets",
          name: "listPets",
          httpMethod: "get",
          path: "",
          status: "active",
          modificationStatus: "modified",
        },
        {
          group: "pets",
          name: "adoptPet",
          httpMethod: "post",
          path: "/:id/adopt",
          status: "available",
        },
        {
          group: "pets",
          name: "sellPet",
          httpMethod: "post",
          path: "/:id/sell",
          status: "removed-from-spec",
        },
        { group: "pets", name: "pingVet", httpMethod: "get", path: "/vet", status: "custom" },
      ],
    },
  ],
  specChanged: true,
  totalActive: 2,
  totalAvailable: 1,
  totalCustom: 1,
};

const PLAN = {
  digest: "plan-1",
  dir: "src/api/pets",
  writes: [{ path: "src/api/pets/pets/index.ts", action: "merge", was: "recorded-edited" }],
  removals: [],
  kept: [],
  pending: [],
  blocked: [],
  forgotten: [],
};

let manage: UseManageReturn;
let removal: UseRemoveImportReturn;

function Manage(): React.ReactElement {
  manage = useManage();
  return <ManageDialog manage={manage} />;
}

function Remove({
  onRemoved,
}: {
  onRemoved: (name: string, message: string) => void;
}): React.ReactElement {
  removal = useRemoveImport(onRemoved);
  return <RemoveImportDialog removal={removal} />;
}

async function settle(interaction: () => unknown): Promise<void> {
  await act(async () => {
    await interaction();
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("managing an import whose spec changed", () => {
  it("reviews what changed, adds the endpoints picked and drops those the spec dropped, then applies the files", async () => {
    vi.mocked(post).mockImplementation(async (url: string) => {
      if (url === "/api/apis/manage/inventory") return INVENTORY;
      if (url === "/api/apis/manage/preview")
        return {
          plan: PLAN,
          removeResult: {
            modifiedFiles: [],
            deletedFiles: [],
            removedFingerprints: [],
            orphanedSchemas: ["SellRequest"],
            modifiedEndpointsWarning: [],
          },
        };
      if (url === "/api/apis/manage/apply")
        return {
          written: [PLAN.writes[0]?.path],
          removed: [],
          kept: [],
          pruneFailures: [],
          leftBehind: [],
        };
      throw new Error(`unexpected request to ${url}`);
    });
    render(<Manage />);

    await settle(() => manage.start(SOURCE, SPEC));

    expect(screen.getByRole("heading", { name: "Review update · pets" })).toBeTruthy();
    const group = within(screen.getByRole("region", { name: "Group pets" }));
    expect(group.getByText("New")).toBeTruthy();
    expect(group.getByText("Removed from spec")).toBeTruthy();
    expect(group.getByText("Edited")).toBeTruthy();
    expect(group.getByText("Custom")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Keep pets" })).toHaveProperty(
      "indeterminate",
      true,
    );
    /* An update is worth previewing with nothing picked: what stays follows the new spec. */
    expect(screen.getByRole("button", { name: "Preview changes" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(screen.queryByRole("checkbox", { name: "Keep pets.sellPet" })).toBeNull();
    expect(group.getByTitle(/goes with the update/)).toBeTruthy();
    await settle(() =>
      fireEvent.click(screen.getByRole("checkbox", { name: "Keep pets.adoptPet" })),
    );
    expect(screen.getByText("The update, with 2 changes to endpoints")).toBeTruthy();
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Preview changes" })));

    expect(screen.getByText("merged, your edits kept")).toBeTruthy();
    expect(screen.getByText("SellRequest")).toBeTruthy();
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Apply changes" })));
    expect(vi.mocked(post).mock.calls.map(([url]) => url)).toContain("/api/apis/manage/apply");
    expect(manage.open).toBe(false);
  });
});

describe("managing an import whose spec did not change", () => {
  const UNCHANGED = {
    ...INVENTORY,
    specChanged: false,
    groups: [{ ...INVENTORY.groups[0], endpoints: [INVENTORY.groups[0]?.endpoints[0]] }],
  };

  it("offers to write every file again with nothing picked, and applies that as previewed", async () => {
    vi.mocked(post).mockImplementation(async (url: string) => {
      if (url === "/api/apis/manage/inventory") return UNCHANGED;
      if (url === "/api/apis/manage/preview") return { plan: PLAN };
      if (url === "/api/apis/manage/apply")
        return { written: [], removed: [], kept: [], pruneFailures: [], leftBehind: [] };
      throw new Error(`unexpected request to ${url}`);
    });
    render(<Manage />);
    await settle(() => manage.start(SOURCE, SPEC));

    expect(screen.queryByRole("button", { name: "Preview changes" })).toBeNull();
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Regenerate files" })));
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Apply changes" })));

    const bodies = vi
      .mocked(post)
      .mock.calls.filter(([url]) => url.startsWith("/api/apis/manage/p") || url.endsWith("/apply"))
      .map(([url, body]) => [url, (body as { regenerate?: boolean }).regenerate]);
    expect(bodies).toEqual([
      ["/api/apis/manage/preview", true],
      ["/api/apis/manage/apply", true],
    ]);
    expect(manage.open).toBe(false);
  });

  it("says in the review that every file is written again, the edits kept", async () => {
    vi.mocked(post).mockImplementation(async (url: string) => {
      if (url === "/api/apis/manage/inventory") return UNCHANGED;
      if (url === "/api/apis/manage/preview") return { plan: PLAN };
      throw new Error(`unexpected request to ${url}`);
    });
    render(<Manage />);
    await settle(() => manage.start(SOURCE, SPEC));

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Regenerate files" })));

    expect(
      screen.getByText(
        /Every file is written again from the specification, as this version of Studio writes it/,
      ),
    ).toBeTruthy();
  });
});

describe("removing an import", () => {
  it("says what the config still declares, and removes on Remove", async () => {
    vi.mocked(post).mockImplementation(async (url: string) => {
      if (url === "/api/apis/imports/remove/preview")
        return {
          plan: {
            ...PLAN,
            writes: [],
            removals: [{ path: "src/api/pets/index.ts", was: "recorded" }],
          },
          configFile: "courier.config.ts",
          importDeclared: true,
          configImports: [],
        };
      if (url === "/api/apis/imports/remove")
        return {
          removed: ["src/api/pets/index.ts"],
          written: [],
          kept: [],
          pruneFailures: [],
          leftBehind: [],
        };
      throw new Error(`unexpected request to ${url}`);
    });
    const onRemoved = vi.fn();
    render(<Remove onRemoved={onRemoved} />);

    await settle(() => removal.start("pets"));

    expect(screen.getByRole("heading", { name: "Remove pets" })).toBeTruthy();
    expect(screen.getByText("imports.pets")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Removed, with a copy kept" }).textContent).toContain(
      "src/api/pets/index.ts",
    );
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Remove" })));
    expect(onRemoved).toHaveBeenCalledWith("pets", expect.any(String));
  });
});
