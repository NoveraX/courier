/**
 * @vitest-environment jsdom
 */
/**
 * An imported API's card says what its update check found, and why when it
 * found nothing: a failed check showed a bare "Error", and an import with no
 * URL to check showed "Up to date".
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { SourceStatusInfo } from "../src/views/apis/types";
import type { EnrichedSource } from "../src/views/apis/use-registry";
import { RegistryCard } from "../src/views/apis/registry-card";

const SOURCE: EnrichedSource = {
  name: "pets",
  baseURL: "https://pets.example",
  filePath: "src/api/pets/source.ts",
  groups: [],
  isImported: true,
  hasClient: true,
  registry: {
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
  },
};

function card(status: SourceStatusInfo): void {
  render(
    <TooltipProvider>
      <RegistryCard source={SOURCE} status={status} onCheckUpdates={() => {}} onManage={() => {}} onRemove={() => {}} />
    </TooltipProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("the update check on an import's card", () => {
  it("says why it failed", () => {
    card({ status: "error", error: "https://pets.example/spec did not answer with a specification Studio can read" });

    const badge = screen.getByText("Check failed");

    expect(badge.closest("[title]")?.getAttribute("title")).toBe(
      "https://pets.example/spec did not answer with a specification Studio can read",
    );
  });

  it("says an import with no URL was not checked, and why", () => {
    const why = "A file import has no URL to check; upload its specification in Manage to compare.";
    card({ status: "unchecked", error: why });

    const badge = screen.getByText("Not checked");

    expect(badge.closest("[title]")?.getAttribute("title")).toBe(why);
    expect(screen.queryByText("Up to date")).toBeNull();
  });
});
