/**
 * @vitest-environment jsdom
 */
/**
 * A write Studio refuses is said where the user is looking: above the
 * generated files, however long the expanded one is, and scrolled into
 * view when it arrives.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/code-block", async () => {
  const { createElement } = await import("react");
  return { CodeBlock: ({ code }: { code: string }) => createElement("pre", null, code) };
});

import { PreviewStepView } from "../src/views/apis/preview-step";

const FILES = [
  { path: "src/api/pets/source.ts", content: Array.from({ length: 116 }, (_, i) => `// line ${i}`).join("\n") },
  { path: "src/api/pets/index.ts", content: "export {};\n" },
];
const REFUSAL = 'A source named "api" exists already. Choose another name.';

const scrollIntoView = vi.fn();

function preview(error: string | null): React.ReactElement {
  return (
    <PreviewStepView files={FILES} sourceName="api" error={error} consent={null} onToggleConfirmed={() => {}} />
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  cleanup();
  scrollIntoView.mockReset();
});

describe("a refused write on the preview step", () => {
  it("is said above the generated files and scrolled into view", () => {
    const { rerender } = render(preview(null));

    rerender(preview(REFUSAL));

    const alert = screen.getByRole("alert");
    const firstFile = screen.getByText("src/api/pets/source.ts");
    expect(alert.textContent).toBe(REFUSAL);
    expect(alert.compareDocumentPosition(firstFile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(alert);
  });
});
