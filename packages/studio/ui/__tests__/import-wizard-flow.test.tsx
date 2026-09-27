/**
 * @vitest-environment jsdom
 */
/**
 * The import wizard as the APIs page drives it, against Studio's answers.
 * Once Studio writes the files and names what courier.config must still
 * declare, the wizard stays open on the declare step, says only how many
 * files it wrote, and closes on Done; a write the config fully declares
 * closes it at once. A write Studio will not apply unasked keeps the wizard
 * on the preview with the plan, and the next write quotes it with the steps
 * allowed. The page with no sources says where an API has to be declared.
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
import { StudioRequestError } from "@/lib/studio-request-error";
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

const WRITTEN = {
  written: FILES.map((file) => file.path),
  removed: [],
  kept: [],
  backupDir: ".courier/backups/1-a",
  leftBehind: [],
};

/* A plan whose barrel Studio did not write: replacing it waits for the user. */
const PLAN = {
  digest: "plan-1",
  dir: "src/api/pets",
  writes: [{ path: "src/api/pets/source.ts", action: "create", was: "absent" }],
  removals: [],
  kept: [],
  pending: [{ path: "src/api/pets/index.ts", kind: "replace", reason: "foreign", preselected: false }],
  blocked: [],
  forgotten: [],
};

function refusal(code: string, plan: unknown): StudioRequestError {
  const reason = "Some files are not Studio's to replace unasked.";
  return new StudioRequestError(reason, { error: reason, code, plan }, undefined);
}

/* Studio's answers, by route; the write answers with `declaration` when there is one. */
function studioAnswers(declaration?: unknown): void {
  vi.mocked(post).mockImplementation(async (url: string) => {
    if (url === "/api/apis/parse") return SPEC;
    if (url === "/api/apis/generate") return { files: FILES };
    if (url === "/api/apis/write") return { ...WRITTEN, ...(declaration === undefined ? {} : { declaration }) };
    throw new Error(`unexpected request to ${url}`);
  });
}

/* The first write is refused with the plan; the next is answered as written. */
function studioAsksFirst(): void {
  studioAnswers();
  vi.mocked(post)
    .mockImplementationOnce(async () => SPEC)
    .mockImplementationOnce(async () => ({ files: FILES }))
    .mockImplementationOnce(async () => {
      throw refusal("NEEDS_CONFIRMATION", PLAN);
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
    expect(onWritten).toHaveBeenCalledWith("pets: wrote 2 files");
  });

  it("closes once the config declares everything, and still says what it wrote", async () => {
    studioAnswers();
    const onWritten = vi.fn();
    const { result } = renderHook(() => useImport(onWritten));

    await importAndWrite(result);

    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/apis/write", expect.objectContaining({ sourceName: "pets" }));
    expect(result.current.open).toBe(false);
    expect(onWritten).toHaveBeenCalledWith("pets: wrote 2 files");
    expect(result.current.state.declaration).toBeNull();
  });
});

describe("a write Studio will not apply unasked", () => {
  it("stays on the preview with the plan, and the next write quotes it with the steps allowed", async () => {
    studioAsksFirst();
    const onWritten = vi.fn();
    const { result } = renderHook(() => useImport(onWritten));

    await importAndWrite(result);
    const shown = result.current.state;
    act(() => result.current.toggleConfirmed("src/api/pets/index.ts"));
    await act(() => result.current.write());

    expect(shown.step).toBe("preview");
    expect(shown.consent?.plan.pending).toHaveLength(1);
    expect(shown.consent?.confirmed).toEqual([]);
    expect(onWritten).toHaveBeenCalledTimes(1);
    expect(vi.mocked(post)).toHaveBeenLastCalledWith(
      "/api/apis/write",
      expect.objectContaining({ planDigest: "plan-1", confirm: ["src/api/pets/index.ts"] }),
    );
    expect(result.current.open).toBe(false);
  });

  it("sends no file paths or content with a write", async () => {
    studioAnswers();
    const { result } = renderHook(() => useImport());

    await importAndWrite(result);

    const write = vi.mocked(post).mock.calls.find(([url]) => url === "/api/apis/write");
    expect(write).toBeDefined();
    expect(write?.[1]).not.toHaveProperty("files");
    expect(write?.[1]).not.toHaveProperty("planDigest");
  });

  it("does not quote a plan with blocked files, so the next write plans afresh", async () => {
    studioAnswers();
    vi.mocked(post).mockImplementationOnce(async () => SPEC)
      .mockImplementationOnce(async () => ({ files: FILES }))
      .mockImplementationOnce(async () => {
        throw refusal("TARGET_BLOCKED", { ...PLAN, pending: [], blocked: [{ path: "src/api/pets", reason: "link" }] });
      });
    const { result } = renderHook(() => useImport());

    await importAndWrite(result);
    await act(() => result.current.write());

    const [url, body] = vi.mocked(post).mock.calls.at(-1) ?? [];
    expect(url).toBe("/api/apis/write");
    expect(body).toBeDefined();
    expect(body).not.toHaveProperty("planDigest");
    expect(body).not.toHaveProperty("confirm");
  });

  it("drops the plan shown once a later write is refused for a reason that has none", async () => {
    studioAsksFirst();
    const { result } = renderHook(() => useImport());
    await importAndWrite(result);
    const nameTaken = new StudioRequestError("sources names another API pets.", { error: "sources names another API pets.", code: "NAME_TAKEN" }, undefined);
    vi.mocked(post).mockRejectedValueOnce(nameTaken);

    await act(() => result.current.write());

    expect(result.current.state.consent).toBeNull();
    expect(result.current.error).toBe("sources names another API pets.");
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
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("pets: wrote 2 files");
    expect(vi.mocked(toast.success)).not.toHaveBeenCalledWith("API imported successfully");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
