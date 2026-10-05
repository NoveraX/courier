/**
 * @vitest-environment jsdom
 *
 * Manage and Remove on the new shell, against Studio's answers: an
 * import's endpoints with what changed in its spec — new, dropped, edited,
 * custom — kept or not, the files the change touches allowed one by one
 * and applied; and an import removed with what the config still says.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/lib/api-client", () => ({ post: vi.fn() }));

import { post } from "@/lib/api-client";
import { type UseManageReturn, useManage } from "../src/apis/use-manage";
import { type UseRemoveImportReturn, useRemoveImport } from "../src/apis/use-remove-import";
import { ManageDialog } from "../src/screens/apis/manage/manage-dialog";
import { RemoveImportDialog } from "../src/screens/apis/remove-import-dialog";
import type { ParsedSpec, SourceSummary } from "../src/views/apis/types";

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
  it("reviews what changed, keeps or drops each endpoint, previews the files and applies them", async () => {
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
    expect(screen.getByRole("button", { name: "Preview changes" })).toHaveProperty(
      "disabled",
      true,
    );
    await settle(() =>
      fireEvent.click(screen.getByRole("checkbox", { name: "Keep pets.adoptPet" })),
    );
    await settle(() =>
      fireEvent.click(screen.getByRole("checkbox", { name: "Keep pets.sellPet" })),
    );
    expect(screen.getByText("2 changes selected")).toBeTruthy();
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Preview changes" })));

    expect(screen.getByText("merged, your edits kept")).toBeTruthy();
    expect(screen.getByText("SellRequest")).toBeTruthy();
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Apply changes" })));
    expect(vi.mocked(post).mock.calls.map(([url]) => url)).toContain("/api/apis/manage/apply");
    expect(manage.open).toBe(false);
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
