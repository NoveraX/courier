/**
 * @vitest-environment jsdom
 */
/**
 * The import wizard shows the directory Studio says it will write, and
 * Studio's reason when it refuses the directory or the name.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ post: vi.fn() }));

import { post } from "@/lib/api-client";
import { OptionsStepView } from "../src/views/apis/options-step";
import type { GenerateOptions } from "../src/views/apis/types";

const OPTIONS: GenerateOptions = {
  sourceName: "petStore",
  outputDir: "src/api",
  validation: "zod",
  groupBy: "tag",
  generateTypes: true,
  generateSchemas: true,
  addAuthMiddleware: false,
  includeComments: true,
  generateClient: "direct",
  selectedEndpoints: null,
};

afterEach(() => {
  cleanup();
  vi.mocked(post).mockReset();
});

describe("the options step's target directory", () => {
  it("shows the directory Studio answers, not one the wizard works out", async () => {
    vi.mocked(post).mockResolvedValue({
      dir: "src/api/pet-store",
      sourceFile: "src/api/pet-store/source.ts",
      sourceBinding: "petStore",
    });

    render(<OptionsStepView options={OPTIONS} error={null} onChange={() => {}} />);

    expect(await screen.findByText("src/api/pet-store")).toBeTruthy();
    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/apis/layout", {
      outputDir: "src/api",
      sourceName: "petStore",
      importName: "petStore",
    });
  });

  it("shows Studio's reason when it refuses the directory", async () => {
    vi.mocked(post).mockRejectedValue(new Error('The import\'s outputDir "../lib" is refused'));

    render(<OptionsStepView options={{ ...OPTIONS, outputDir: "../lib" }} error={null} onChange={() => {}} />);

    await waitFor(() => expect(screen.getByText(/outputDir "\.\.\/lib" is refused/)).toBeTruthy());
  });
});

describe("the options step's target directory, as the options change", () => {
  it("drops the previous directory until Studio answers for the new options", async () => {
    let answer: (value: unknown) => void = () => {};
    vi.mocked(post)
      .mockResolvedValueOnce({ dir: "src/api/pet-store", sourceFile: "", sourceBinding: "petStore" })
      .mockImplementationOnce(() => new Promise((resolve) => void (answer = resolve)));
    const view = render(<OptionsStepView options={OPTIONS} error={null} onChange={() => {}} />);
    await screen.findByText("src/api/pet-store");

    view.rerender(<OptionsStepView options={{ ...OPTIONS, outputDir: "lib" }} error={null} onChange={() => {}} />);

    expect(screen.queryByText("src/api/pet-store")).toBeNull();
    await waitFor(() => expect(vi.mocked(post)).toHaveBeenCalledTimes(2));
    answer({ dir: "lib/pet-store", sourceFile: "", sourceBinding: "petStore" });
    expect(await screen.findByText("lib/pet-store")).toBeTruthy();
  });
});
