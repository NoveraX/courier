/**
 * @vitest-environment jsdom
 */
/**
 * A code block is highlighted by Shiki's core with the few grammars it shows,
 * never the whole of Shiki, which would ship every grammar and theme in one
 * 10 MB chunk the first block waits for; and a block that cannot be
 * highlighted is shown plain rather than left a placeholder.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

const shiki = vi.hoisted(() => ({ loaded: [] as string[], fails: false }));

vi.mock("shiki", () => {
  shiki.loaded.push("shiki");
  return {
    codeToHtml: async (code: string) => {
      if (shiki.fails) throw new Error("no grammar");
      return `<pre class="whole-shiki">${code}</pre>`;
    },
  };
});
vi.mock("shiki/core", () => {
  shiki.loaded.push("shiki/core");
  return {
    createHighlighterCore: async () => {
      if (shiki.fails) throw new Error("no grammar");
      return { codeToHtml: (code: string) => `<pre class="shiki-core">${code}</pre>` };
    },
  };
});
vi.mock("shiki/engine/javascript", () => ({ createJavaScriptRegexEngine: () => ({}) }));
vi.mock("shiki/themes/github-dark-default.mjs", () => ({ default: {} }));
vi.mock("shiki/langs/typescript.mjs", () => ({ default: [] }));
vi.mock("shiki/langs/tsx.mjs", () => ({ default: [] }));
vi.mock("shiki/langs/javascript.mjs", () => ({ default: [] }));
vi.mock("shiki/langs/jsx.mjs", () => ({ default: [] }));
vi.mock("shiki/langs/json.mjs", () => ({ default: [] }));

beforeEach(() => {
  vi.resetModules();
  shiki.loaded.length = 0;
  shiki.fails = false;
});

afterEach(cleanup);

async function show(code: string): Promise<void> {
  const { CodeBlock } = await import("@/components/shared/code-block");
  render(
    <TooltipProvider>
      <CodeBlock code={code} language="ts" />
    </TooltipProvider>,
  );
}

describe("a code block", () => {
  it("is highlighted by Shiki's core, never the whole of Shiki", async () => {
    await show("const answer = 42");

    await waitFor(() => expect(document.querySelector(".shiki-core")).not.toBeNull());
    expect(shiki.loaded).toContain("shiki/core");
    expect(shiki.loaded).not.toContain("shiki");
  });

  it("is shown plain when it cannot be highlighted", async () => {
    shiki.fails = true;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await show("const answer = 42");

    await waitFor(() => expect(screen.getByText(/answer/)).toBeTruthy());
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });
});
