/**
 * @vitest-environment jsdom
 *
 * What the import wizard says Studio left out of an import: the operations
 * it could not import, and apart from them the patterns too long to check
 * values against, each named where it was.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ParsedSpec } from "@/features/apis/types";
import { SelectEndpointsStep } from "@/screens/apis/import/select-endpoints-step";

afterEach(cleanup);

function spec(skipped: ParsedSpec["skipped"]): ParsedSpec {
  return {
    title: "Pets",
    version: "1",
    description: "",
    baseURL: "https://pets.example",
    format: "openapi3",
    groups: [],
    schemas: {},
    securitySchemes: [],
    skipped,
  };
}

function step(skipped: ParsedSpec["skipped"]): void {
  render(
    <SelectEndpointsStep
      spec={spec(skipped)}
      selected={{}}
      onToggleEndpoint={() => {}}
      onToggleGroup={() => {}}
      onToggleAll={() => {}}
    />,
  );
}

const TRACE = { method: "TRACE", path: "/pets", reason: "Studio imports no TRACE operation" };
const PATTERN = {
  method: "PATTERN",
  path: "#/components/schemas/Zone/properties/name",
  reason: "its pattern is 9000 characters long, more than the 8192 Studio compiles",
};

describe("what an import leaves out", () => {
  it("counts the patterns apart from the operations", () => {
    step([TRACE, PATTERN, { ...PATTERN, path: "#/components/schemas/Zone/properties/code" }]);

    expect(
      screen.getByText("1 operation and 2 pattern checks left out of this import"),
    ).toBeTruthy();
    expect(screen.getByText(`PATTERN ${PATTERN.path}`).getAttribute("title")).toBe(PATTERN.reason);
  });

  it("names only what it left out", () => {
    step([PATTERN]);

    expect(screen.getByText("1 pattern check left out of this import")).toBeTruthy();
  });

  it("says nothing when it left nothing out", () => {
    step([]);

    expect(screen.queryByText(/left out of this import/)).toBeNull();
  });
});
