/**
 * @vitest-environment jsdom
 */
/**
 * An imported API's card names the validation library its code is
 * generated with, as Studio lists the import: the default for a
 * declaration that leaves it out, and nothing for an import whose options
 * Studio does not know.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { importsSnapshotOf, summarizeImports } from "../../src/server/imports-bridge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isSourceSummary } from "../src/socket/source-list-guards";
import { RegistryCard } from "../src/views/apis/registry-card";
import { API } from "./playground-fixtures";

let root: string;

function renderCard(declaration: Record<string, unknown>): void {
  const [summary] = summarizeImports(
    importsSnapshotOf({ api: { importType: "file", type: "openapi", outputDir: "src/api", ...declaration } }, root),
  );
  /* The list reaches the page over the socket as JSON, and passes the page's guard. */
  const registry: unknown = JSON.parse(JSON.stringify(summary));
  if (!isSourceSummary(registry)) throw new Error("Studio's import summary does not pass the UI's guard");
  render(
    <TooltipProvider>
      <RegistryCard source={{ ...API, registry }} onCheckUpdates={() => {}} onManage={() => {}} onRemove={() => {}} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "courier-registry-card-"));
});

afterEach(() => {
  cleanup();
  rmSync(root, { recursive: true, force: true });
});

describe("the imported API's card", () => {
  it("names the default library for a declaration that leaves it out", () => {
    renderCard({});

    expect(screen.getByText("zod")).toBeTruthy();
    expect(screen.queryByText("none")).toBeNull();
  });

  it("names the library a declaration chooses", () => {
    renderCard({ validation: "valibot" });

    expect(screen.getByText("valibot")).toBeTruthy();
  });
});
