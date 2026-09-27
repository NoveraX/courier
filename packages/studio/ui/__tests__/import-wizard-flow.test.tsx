/**
 * @vitest-environment jsdom
 */
/**
 * The import wizard as the APIs page drives it, against Studio's answers.
 * Once Studio writes the files and names what courier.config must still
 * declare, the wizard stays open on the declare step, says only how many
 * files it wrote, and closes on Done; a write the config fully declares
 * closes it at once. The page with no sources says where an API has to be
 * declared.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/api-client", () => ({ post: vi.fn() }));
vi.mock("@/components/shared/code-block", async () => {
  const { createElement } = await import("react");
  return { CodeBlock: ({ code }: { code: string }) => createElement("pre", null, code) };
});

import type { ParsedSpec } from "../src/views/apis/types";

import { toast } from "sonner";
import { post } from "@/lib/api-client";
import { useStudioStore } from "@/store";
import { ApisView } from "../src/views/apis";
import { useImport } from "../src/views/apis/use-import";

const SPEC_URL = "https://specs.example/pets.json";

const SPEC: ParsedSpec = {
  title: "Pets",
  version: "1",
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
      ],
    },
  ],
  schemas: {},
  securitySchemes: [],
  skipped: [],
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

/* Studio's answers, by route; the write answers with `declaration` when there is one. */
function studioAnswers(declaration?: unknown): void {
  vi.mocked(post).mockImplementation(async (url: string) => {
    if (url === "/api/apis/parse") return SPEC;
    if (url === "/api/apis/generate") return { files: FILES };
    if (url === "/api/apis/write") {
      const files = FILES.map((file) => ({ path: file.path, status: "safe" }));
      return { written: 2, merged: 0, files, ...(declaration === undefined ? {} : { declaration }) };
    }
    throw new Error(`unexpected request to ${url}`);
  });
}

beforeEach(() => {
  useStudioStore.setState({
    connected: true,
    configStatus: { state: "loaded", revision: 1, configFile: "courier.config.ts", loadedAt: 1_000 },
    scanSources: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/* Drive the wizard's own actions from the import step to the write. */
async function importAndWrite(wizard: { current: ReturnType<typeof useImport> }): Promise<void> {
  act(() => wizard.current.openWizard());
  act(() => wizard.current.setContent(SPEC_URL));
  await act(() => wizard.current.parse());
  act(() => wizard.current.goToStep("options"));
  await act(() => wizard.current.preview());
  await act(() => wizard.current.write());
}

describe("the import wizard's write", () => {
  it("stays open on the declare step while the config lacks part of the declaration", async () => {
    studioAnswers(DECLARATION);
    const onWritten = vi.fn();
    const { result } = renderHook(() => useImport(onWritten));

    await importAndWrite(result);

    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/apis/write", expect.objectContaining({ sourceName: "pets" }));
    expect(result.current.state.step).toBe("declare");
    expect(result.current.state.declaration).toMatchObject({ configFile: "courier.config.ts" });
    expect(result.current.open).toBe(true);
    expect(onWritten).toHaveBeenCalledWith("Wrote 2 files for pets");
  });

  it("closes once the config declares everything, and still says what it wrote", async () => {
    studioAnswers();
    const onWritten = vi.fn();
    const { result } = renderHook(() => useImport(onWritten));

    await importAndWrite(result);

    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/apis/write", expect.objectContaining({ sourceName: "pets" }));
    expect(result.current.open).toBe(false);
    expect(onWritten).toHaveBeenCalledWith("Wrote 2 files for pets");
    expect(result.current.state.declaration).toBeNull();
  });
});

describe("the APIs page", () => {
  it("says Studio lists the APIs courier.config declares under sources while there are none", () => {
    render(<ApisView />);

    expect(screen.getByText(/Studio lists the APIs courier\.config declares under sources\./)).toBeTruthy();
    expect(screen.queryByText(/automatically/)).toBeNull();
  });

  it("shows the declare step after the write, with Done, and toasts only what was written", async () => {
    studioAnswers(DECLARATION);
    render(<ApisView />);

    fireEvent.click(screen.getAllByRole("button", { name: /Import API/ })[0]);
    fireEvent.change(screen.getByPlaceholderText(/swagger\.json/), { target: { value: SPEC_URL } });
    fireEvent.click(screen.getByRole("button", { name: /Parse Spec/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Configure \(1\)/ }));
    fireEvent.click(screen.getByRole("button", { name: /Generate Preview/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Write to Disk/ }));

    expect(await screen.findByRole("heading", { name: "Declare pets in courier.config.ts" })).toBeTruthy();
    expect(screen.getByText(DECLARATION.source.importLine)).toBeTruthy();
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Wrote 2 files for pets");
    expect(vi.mocked(toast.success)).not.toHaveBeenCalledWith("API imported successfully");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
