/**
 * @vitest-environment jsdom
 *
 * Import API on the new shell, against Studio's answers: a spec read from
 * a URL, its endpoints picked, the generation configured with the
 * directory Studio will write to, the files previewed and written, then
 * what to declare; and a write Studio will not apply unasked, which shows
 * its plan and writes as allowed next.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/lib/api-client", () => ({ post: vi.fn() }));

import { post } from "@/lib/api-client";
import { StudioRequestError } from "@/lib/studio-request-error";
import { useImport } from "../src/apis/use-import";
import { ImportDialog } from "../src/screens/apis/import/import-dialog";
import type { ParsedSpec } from "../src/views/apis/types";

const SPEC: ParsedSpec = {
  title: "Pets",
  version: "1.2.0",
  description: "",
  baseURL: "https://pets.example",
  format: "openapi3",
  groups: [
    {
      name: "pets",
      description: "",
      prefix: "/pets",
      endpoints: [
        {
          name: "listPets",
          operationId: "listPets",
          httpMethod: "get",
          path: "",
          fullPath: "/pets",
          description: "",
          secured: false,
          requestBody: null,
          parameters: [],
          responseSchema: null,
          tags: ["pets"],
        },
        {
          name: "createPet",
          operationId: "createPet",
          httpMethod: "post",
          path: "",
          fullPath: "/pets",
          description: "",
          secured: false,
          requestBody: null,
          parameters: [],
          responseSchema: null,
          tags: ["pets"],
        },
      ],
    },
  ],
  schemas: {},
  securitySchemes: [],
  skipped: [{ method: "TRACE", path: "/pets", reason: "TRACE is not generated" }],
};

const FILES = [
  { path: "src/api/pets/source.ts", content: "export const pets = defineApi({});\n" },
  { path: "src/api/pets/index.ts", content: 'export { pets } from "./source";\n' },
];

const DECLARATION = {
  configFile: "courier.config.ts",
  source: { importLine: 'import { pets } from "./src/api/pets/source";', entry: "pets," },
  importEntry: '  "pets": {\n    importType: "url",\n  },',
};

const PLAN = {
  digest: "plan-1",
  dir: "src/api/pets",
  writes: [{ path: "src/api/pets/source.ts", action: "create", was: "absent" }],
  removals: [],
  kept: [],
  pending: [
    { path: "src/api/pets/index.ts", kind: "replace", reason: "foreign", preselected: false },
  ],
  blocked: [],
  forgotten: [],
};

function answers(write: () => unknown): void {
  vi.mocked(post).mockImplementation(async (url: string) => {
    if (url === "/api/apis/parse") return SPEC;
    if (url === "/api/apis/layout")
      return { dir: "src/api/pets/", sourceFile: "src/api/pets/source.ts", sourceBinding: "pets" };
    if (url === "/api/apis/generate") return { files: FILES };
    if (url === "/api/apis/write") return write();
    throw new Error(`unexpected request to ${url}`);
  });
}

function Dialog({ onWritten }: { onWritten: (message: string) => void }): React.ReactElement {
  const wizard = useImport(onWritten);
  return (
    <>
      <button type="button" onClick={() => wizard.openWizard()}>
        open
      </button>
      <ImportDialog wizard={wizard} />
    </>
  );
}

async function settle(interaction: () => unknown): Promise<void> {
  await act(async () => {
    await interaction();
  });
}

async function toPreview(): Promise<void> {
  await settle(() => fireEvent.click(screen.getByRole("button", { name: "open" })));
  fireEvent.change(screen.getByRole("textbox", { name: "Spec URL" }), {
    target: { value: "https://specs.example/pets.json" },
  });
  await settle(() => fireEvent.click(screen.getByRole("button", { name: "Parse spec" })));
  await settle(() => fireEvent.click(screen.getByRole("button", { name: "Continue" })));
  await settle(() => new Promise((resolve) => setTimeout(resolve, 260)));
  await settle(() => fireEvent.click(screen.getByRole("button", { name: "Generate preview" })));
}

/* jsdom lays nothing out, so it has no scrolling to bring an alert into view. */
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("importing an API", () => {
  it("reads the spec, picks endpoints, configures and previews the files, writes them, and says what to declare", async () => {
    answers(() => ({
      written: FILES.map((f) => f.path),
      removed: [],
      kept: [],
      pruneFailures: [],
      leftBehind: [],
      declaration: DECLARATION,
    }));
    const onWritten = vi.fn();
    render(<Dialog onWritten={onWritten} />);
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "open" })));

    fireEvent.change(screen.getByRole("textbox", { name: "Spec URL" }), {
      target: { value: "https://specs.example/pets.json" },
    });
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Parse spec" })));
    expect(screen.getByText("OpenAPI 3 · v1.2.0 · 2 operations · 1 group")).toBeTruthy();
    expect(screen.getByText("TRACE /pets")).toBeTruthy();
    await settle(() =>
      fireEvent.click(screen.getByRole("checkbox", { name: "Select pets.createPet" })),
    );
    expect(screen.getByText("1 of 2 selected")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Select pets" })).toHaveProperty(
      "indeterminate",
      true,
    );
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Continue" })));
    await settle(() => new Promise((resolve) => setTimeout(resolve, 260)));
    expect(screen.getByText("src/api/pets/")).toBeTruthy();
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Generate preview" })));

    const files = within(screen.getByRole("region", { name: "Generated files" }));
    expect(files.getByRole("button", { name: /source\.ts/ })).toHaveProperty("ariaPressed", "true");
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Write 2 files" })));

    expect(
      screen.getByRole("heading", { name: /Declare pets in courier\.config\.ts/ }),
    ).toBeTruthy();
    expect(document.body.textContent).toContain('import { pets } from "./src/api/pets/source";');
    expect(onWritten).toHaveBeenCalledTimes(1);
  });

  it("shows the plan of a write Studio will not apply unasked, and writes as allowed next", async () => {
    let calls = 0;
    answers(() => {
      calls += 1;
      if (calls === 1)
        throw new StudioRequestError(
          "Some files are not Studio's to replace unasked.",
          {
            error: "Some files are not Studio's to replace unasked.",
            code: "NEEDS_CONFIRMATION",
            plan: PLAN,
          },
          undefined,
        );
      return {
        written: [FILES[0]?.path],
        removed: [],
        kept: [],
        pruneFailures: [],
        leftBehind: [],
        declaration: DECLARATION,
      };
    });
    render(<Dialog onWritten={vi.fn()} />);
    await toPreview();

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Write 2 files" })));

    expect(screen.getByRole("alert").textContent).toBe(
      "Some files are not Studio's to replace unasked.",
    );
    expect(screen.getByRole("region", { name: "Files that wait for you" })).toBeTruthy();
    await settle(() =>
      fireEvent.click(screen.getByRole("checkbox", { name: "Allow src/api/pets/index.ts" })),
    );
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Write as allowed" })));
    expect(vi.mocked(post).mock.calls.at(-1)?.[1]).toMatchObject({
      planDigest: "plan-1",
      confirm: ["src/api/pets/index.ts"],
    });
  });
});
